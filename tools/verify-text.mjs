// tools/verify-text.mjs — accuracy audit v3 for the Quranic Arabic dataset.
//
// Cross-checks our data against independent sources at several strictness tiers,
// so convention differences (mark styles, transliteration, inline clarifications)
// don't hide real errors — and vice versa:
//
//   A. Arabic text vs alquran.cloud "quran-uthmani" + Tanzil Uthmani (same script, skeleton)
//   B. Arabic text vs local Tanzil simple text (different rasm; classified word-pair diffs)
//   C. Translations vs alquran.cloud:
//        tier1 exact · tier2 typographic · tier3 letters-only · tier3b bracket-insensitive
//   D. Word-by-word alignment of words[] with the ayah text
//   E. Structural integrity (empty fields, audio refs, globals, basmala flags)
//   F. Vocabulary (builder's own normaliser: counts, first refs, audio refs)
//   G. Letters (forms, connectors, order, audio)
//
// References cached in cache/ref/. Usage: node tools/verify-text.mjs [simple.txt]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'cache', 'ref');
const SIMPLE_TXT = process.argv[2] || 'C:/Users/sofia/Documents/Islam/quran-simple-clean.txt';
const DETAIL = [];
const out = (s = '') => { console.log(s); DETAIL.push(s); };

// ---------- normalisers ----------
const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200E\u200F\uFEFF]/g;
const fixLetters = (s) =>
  s.replace(/\u0640/g, '')                              // tatweel
   .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')    // آ أ إ ٱ → ا
   .replace(/\u0649/g, '\u064A');                       // ى → ي

const skeleton = (s) => fixLetters(s.normalize('NFC').replace(MARKS, '')).replace(/\u0621\u0627/g, '\u0627');
const rasm = (s) =>
  fixLetters(
    s.normalize('NFC')
      .replace(/\u0649\u0670/g, '\u0649')   // علىٰ → على
      .replace(/\u0670/g, '\u0627')         // علمٰين → العالمين
      .replace(MARKS, ''),
  ).replace(/\u0621\u0627/g, '\u0627');     // ءا (hamza + alef) → ا
const toWords = (s) => s.split(/\s+/).map((w) => w.trim()).filter(Boolean);
const normWords = (fn) => (s) => toWords(fn(s));

const tidy = (s) => s.replace(/\s+/g, ' ').trim();
const typo = (s) => tidy(s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-'));
const lettersOnly = (s) => typo(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const noBrackets = (s) => s.replace(/\[[^\]]*\]/g, ' ');

const BASMALA = normWords(skeleton)('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'); // 4 words

// ---------- references ----------
async function ref(name, url) {
  const file = path.join(CACHE, name + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}
const byKey = (edition) => {
  const m = new Map();
  for (const s of edition.data.surahs) for (const a of s.ayahs) m.set(`${s.number}:${a.numberInSurah}`, a.text);
  return m;
};

// ---------- our data ----------
const ours = [];
for (let s = 1; s <= 114; s++) {
  const surah = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'quran', String(s).padStart(3, '0') + '.json'), 'utf8'));
  for (const a of surah.ayahs) { a.surahId = surah.id; a.bismillahPre = surah.bismillah_pre; }
  ours.push(surah);
}
let g = 0;
for (const s of ours) for (const a of s.ayahs) a.expectedGlobal = ++g;

const simple = new Map(
  fs.readFileSync(SIMPLE_TXT, 'utf8').split(/\r?\n/)
    .map((l) => l.split('|'))
    .filter((p) => p.length === 3 && /^\d+$/.test(p[0]))
    .map((p) => [`${+p[0]}:${+p[1]}`, p[2]]),
);

const cloud = byKey(await ref('uthmani', 'https://api.alquran.cloud/v1/quran/quran-uthmani'));
const pick = byKey(await ref('pickthall', 'https://api.alquran.cloud/v1/quran/en.pickthall'));
const sahih = byKey(await ref('sahih', 'https://api.alquran.cloud/v1/quran/en.sahih'));

// Tanzil's plain txt export has no ayah numbers — map sequentially in canonical order.
const tanzilLines = fs.readFileSync(path.join(CACHE, 'tanzil-uthmani.txt'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
if (tanzilLines.length !== 6236) console.warn(`WARNING: tanzil lines = ${tanzilLines.length}, expected 6236`);

// ---------- run ----------
out(`our ayahs: ${g} · simple-text lines: ${simple.size} · cloud entries: ${cloud.size} · tanzil lines: ${tanzilLines.length}`);
out();

const wordDiffs = (a1, a2) => {
  const diffs = [];
  const n = Math.max(a1.length, a2.length);
  for (let i = 0; i < n; i++) if (a1[i] !== a2[i]) diffs.push(`${a1[i] ?? '∅'}|${a2[i] ?? '∅'}`);
  return diffs;
};
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const A = { ayahs: [], pairs: new Map(), concat: [] };
const B = { ayahs: [], pairs: new Map(), basmala: 0, concat: [] };
const C1 = { exact: [], typo: [], letters: [], brackets: [] };
const C2 = { exact: [], typo: [], letters: [], brackets: [] };
const D = []; const E = [];
let tzIdx = 0;

for (const s of ours) {
  for (const a of s.ayahs) {
    const key = `${s.id}:${a.n}`;
    const dropBasmala = (arr) => {
      if (!a.bismillahPre) return arr;
      if (arr.slice(0, 4).join(' ') === BASMALA.join(' ')) { B.basmala++; return arr.slice(4); }
      return arr;
    };
    const tzTxt = tanzilLines[tzIdx++];

    for (const [label, refTxt, bucket, nrm] of [
      ['cloud', cloud.get(key), A, skeleton],
      ['tanzil', tzTxt, A, skeleton],
      ['simple', simple.get(key), B, rasm],
    ]) {
      if (!refTxt) { E.push(`${key}: missing in ${label}`); continue; }
      const o = normWords(nrm)(a.text);
      const t = dropBasmala(normWords(nrm)(refTxt));
      if (o.join(' ') !== t.join(' ')) {
        const ds = wordDiffs(o, t);
        bucket.ayahs.push({ key, label, ds });
        for (const d of ds) bump(bucket.pairs, d);
        if (o.join('') !== t.join('')) bucket.concat.push({ key, label, o: o.join(' '), t: t.join(' ') });
      }
    }

    const p = pick.get(key); const h = sahih.get(key);
    if (p) {
      const o = a.tr.pickthall;
      if (tidy(o) !== tidy(p)) C1.exact.push({ key, o, t: p });
      if (typo(o) !== typo(p)) C1.typo.push({ key, o, t: p });
      if (lettersOnly(o) !== lettersOnly(p)) C1.letters.push({ key, o, t: p });
      if (lettersOnly(noBrackets(o)) !== lettersOnly(noBrackets(p))) C1.brackets.push({ key, o, t: p });
    } else E.push(`${key}: no pickthall in reference`);
    if (h) {
      const o = a.tr.sahih;
      if (tidy(o) !== tidy(h)) C2.exact.push({ key, o, t: h });
      if (typo(o) !== typo(h)) C2.typo.push({ key, o, t: h });
      if (lettersOnly(o) !== lettersOnly(h)) C2.letters.push({ key, o, t: h });
      if (lettersOnly(noBrackets(o)) !== lettersOnly(noBrackets(h))) C2.brackets.push({ key, o, t: h });
    } else E.push(`${key}: no sahih in reference`);

    const joined = a.words.map((w) => skeleton(w.ar).trim()).filter(Boolean).join(' ');
    const textWords = normWords(skeleton)(a.text).join(' ');
    if (joined !== textWords) D.push({ key, joined, textWords });

    if (!a.words.length) E.push(`${key}: no words`);
    const seen = new Set();
    for (const w of a.words) {
      if (!w.ar || !w.translit || !w.gloss || !w.audio) E.push(`${key} w${w.n}: empty field`);
      if (!/^wbw\/\d{3}_\d{3}_\d{3}\.mp3$/.test(w.audio)) E.push(`${key} w${w.n}: bad audio ref ${w.audio}`);
      if (seen.has(w.audio)) E.push(`${key}: duplicate audio ${w.audio}`);
      seen.add(w.audio);
    }
    if (/[A-Za-z]/.test(a.text)) E.push(`${key}: latin chars in Arabic text`);
    if (a.global !== a.expectedGlobal) E.push(`${key}: global mismatch`);
    if (s.id === 1 && a.n === 1 && a.bismillahPre) E.push('1:1: bismillah_pre should be false');
    if (s.id === 9 && a.bismillahPre) E.push('9:1: bismillah_pre should be false');
    if (s.id > 1 && s.id !== 9 && a.n === 1 && !a.bismillahPre) E.push(`${key}: bismillah_pre false, expected true`);
  }
}

// ---------- report ----------
const classOf = (pair) => {
  const [x, y] = pair.split('|');
  if (x === y) return 'identical';
  const stripCh = (s, ch) => s.split(ch).join('');
  if (stripCh(x, '\u0648') === stripCh(y, '\u0648')) return 'waw  و';
  if (stripCh(x, '\u0627') === stripCh(y, '\u0627')) return 'alef ا';
  if (stripCh(x, '\u0627').split('\u0648').join('') === stripCh(y, '\u0627').split('\u0648').join('')) return 'alef/waw combo';
  if (stripCh(x, '\u0647') === stripCh(y, '\u0647')) return 'ha ه';
  if (stripCh(x, '\u0629') === stripCh(y, '\u0629')) return 'ta-marbuta ة';
  return 'OTHER';
};

const showPairs = (title, bucket, cap = 30) => {
  out(`== ${title} ==`);
  out(`   ${bucket.ayahs.length} ayah(s) differ · ${bucket.pairs.size} unique word-pair(s)`);
  const sorted = [...bucket.pairs.entries()].sort((a, b) => b[1] - a[1]);
  const classes = new Map();
  for (const [pair, n] of sorted) bump(classes, classOf(pair));
  out(`   classes: ${[...classes.entries()].map(([c, n]) => `${c}:${n}`).join('  ')}`);
  out(`   concat (letters only, spaces ignored): ${bucket.concat.length} ayah(s)`);
  for (const [pair, n] of sorted.slice(0, cap)) out(`   ×${String(n).padStart(4)}  [${classOf(pair)}]  ${pair}`);
  if (sorted.length > cap) out(`   … and ${sorted.length - cap} more unique pairs`);
  const others = sorted.filter(([pair]) => classOf(pair) === 'OTHER');
  if (others.length) {
    out(`   -- ${others.length} pair(s) not explained by simple letter classes --`);
    for (const [pair, n] of others.slice(0, 40)) out(`   ×${String(n).padStart(4)}  ${pair}`);
    if (others.length > 40) out(`   … and ${others.length - 40} more`);
  }
  if (bucket.concat.length && bucket.concat.length <= 40) {
    for (const c of bucket.concat) {
      out(`   concat diff ${c.key} [${c.label}]`);
      out(`      ours  : …${c.o.slice(0, 150)}`);
      out(`      theirs: …${c.t.slice(0, 150)}`);
    }
  }
  if (bucket.ayahs.length && bucket.ayahs.length <= 60) {
    out('   per-ayah word diffs:');
    for (const a of bucket.ayahs) out(`   ${a.key} [${a.label}] ${(a.ds || []).slice(0, 8).join(' · ')}`);
  }
  out();
};

showPairs('A. Arabic (skeleton) vs alquran.cloud + Tanzil', A, 80);
showPairs('B. Arabic (rasm) vs local simple text', B, 30);
out(`   (leading basmala stripped from references in ${B.basmala} first-ayah comparisons)`);
out();

for (const [name, c] of [['Pickthall', C1], ['Sahih International', C2]]) {
  out(`== C. ${name} vs alquran.cloud ==`);
  out(`   tier1 exact        : ${c.exact.length} ayah(s)`);
  out(`   tier2 typographic  : ${c.typo.length} ayah(s)`);
  out(`   tier3 letters-only : ${c.letters.length} ayah(s)`);
  out(`   tier3b no-brackets : ${c.brackets.length} ayah(s)   ← real wording differences`);
  const show = c.brackets.length ? c.brackets : c.letters;
  for (const d of show.slice(0, 12)) {
    out(`   ${d.key}`);
    out(`      ours  : ${d.o.slice(0, 200)}`);
    out(`      theirs: ${d.t.slice(0, 200)}`);
  }
  if (show.length > 12) out(`   … and ${show.length - 12} more`);
  out();
}

out(`== D. Word-by-word alignment ==`);
out(`   ${D.length} ayah(s) where words[] != text`);
for (const d of D.slice(0, 5)) { out(`   ${d.key}`); out(`      joined: ${d.joined.slice(0, 140)}`); out(`      text  : ${d.textWords.slice(0, 140)}`); }
if (D.length > 5) out(`   … and ${D.length - 5} more`);
out();

out(`== E. Structural ==`);
out(`   ${E.length} issue(s)`);
for (const e of E.slice(0, 12)) out(`   ${e}`);
if (E.length > 12) out(`   … and ${E.length - 12} more`);
out();

// ---------- F. vocabulary ----------
out('== F. Vocabulary ==');
const bstrip = (s) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0671\u06D6-\u06ED\u0640]/g, '');
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vocabulary.json'), 'utf8')).words;
const stored = new Map();
for (const s of ours) for (const a of s.ayahs) for (const w of a.words) {
  const n = bstrip(w.ar); if (!n) continue;
  const rec = stored.get(n);
  if (rec) { rec.count++; rec.audios.add(w.audio); }
  else stored.set(n, { count: 1, ref: `${s.id}:${a.n}`, audio: w.audio, audios: new Set([w.audio]) });
}
let fIssues = 0;
for (const w of vocab) {
  const rec = stored.get(w.ar_norm);
  if (!rec) { fIssues++; out(`   ${w.rank} ${w.ar}: normalised form not found`); continue; }
  if (rec.count !== w.count) { fIssues++; out(`   ${w.rank} ${w.ar}: stored ${w.count}, recounted ${rec.count}`); }
  if (rec.ref !== w.ref) { fIssues++; out(`   ${w.rank} ${w.ar}: ref ${w.ref} vs ${rec.ref}`); }
  // The clip may come from any occurrence of the same word (a working clip is
  // preferred over a broken first-occurrence one); rec.ref stays the first occurrence.
  if (!rec.audios.has(w.audio)) {
    fIssues++;
    out(`   ${w.rank} ${w.ar}: audio ${w.audio} is not an occurrence of this word`);
  }
}
out(`   issues: ${fIssues} / ${vocab.length}`);
out();

// ---------- G. letters ----------
out('== G. Letters ==');
const letters = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'letters.json'), 'utf8'));
const TAT = '\u0640';
const EXPECTED = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
let lIssues = 0;
for (const l of letters) {
  const { isolated, initial, medial, final } = l.forms;
  if (isolated !== l.ar) { lIssues++; out(`   ${l.id}: isolated != ar`); }
  if (l.connects_forward) {
    if (initial !== l.ar + TAT || medial !== TAT + l.ar + TAT || final !== TAT + l.ar) { lIssues++; out(`   ${l.id}: form mismatch`); }
  } else if (initial !== null || medial !== null || final !== TAT + l.ar) { lIssues++; out(`   ${l.id}: non-connector form mismatch`); }
  if (!l.audio) { lIssues++; out(`   ${l.id}: no audio`); }
}
if (letters.map((l) => l.ar).join('') !== EXPECTED) { lIssues++; out('   letter set/order mismatch'); }
out(`   issues: ${lIssues}`);

out();
out('=======================');
out(`A: ${A.ayahs.length} ayahs · B: ${B.ayahs.length} ayahs · C1 exact ${C1.exact.length}/letters ${C1.letters.length}/nobrackets ${C1.brackets.length} · C2 exact ${C2.exact.length}/letters ${C2.letters.length}/nobrackets ${C2.brackets.length} · D ${D.length} · E ${E.length} · F ${fIssues} · G ${lIssues}`);
out('=======================');

fs.mkdirSync(path.join(ROOT, 'cache'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'cache', 'verify-report.txt'), DETAIL.join('\n'));
console.log('\nfull report: cache/verify-report.txt');
