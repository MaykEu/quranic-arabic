// Validate the generated dataset + seed files. Exits 0 with an OK line, or 1 with a list of problems.
// Usage: node tools/validate-data.mjs
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errs = [];
const ok = (cond, msg) => { if (!cond) errs.push(msg); };
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

// ---- Quran dataset ----
const index = await readJson(path.join(ROOT, 'data', 'quran', 'index.json'));
ok(index.surahs.length === 114, `index.json: expected 114 surahs, got ${index.surahs.length}`);
const totalAyahs = index.surahs.reduce((t, c) => t + c.verses_count, 0);
ok(totalAyahs === 6236, `index.json: expected 6236 total ayahs, got ${totalAyahs}`);

const quranFiles = (await readdir(path.join(ROOT, 'data', 'quran'))).filter((f) => /^\d{3}\.json$/.test(f));
ok(quranFiles.length === 114, `data/quran: expected 114 surah files, got ${quranFiles.length}`);

let expectedGlobal = 0;
for (const c of index.surahs) {
  const file = `${String(c.id).padStart(3, '0')}.json`;
  const d = await readJson(path.join(ROOT, 'data', 'quran', file));
  ok(d.ayahs.length === c.verses_count, `${file}: ${d.ayahs.length} ayahs, expected ${c.verses_count}`);
  for (const a of d.ayahs) {
    expectedGlobal++;
    ok(a.global === expectedGlobal, `${file} ${c.id}:${a.n}: global ${a.global}, expected ${expectedGlobal}`);
    ok(typeof a.text === 'string' && a.text.length > 0, `${file} ${c.id}:${a.n}: empty text`);
    ok(!a.text.includes('\uFEFF'), `${file} ${c.id}:${a.n}: BOM found in text`);
    ok(a.text === a.text.trim(), `${file} ${c.id}:${a.n}: leading/trailing whitespace`);
    ok(a.words.length > 0, `${file} ${c.id}:${a.n}: no words`);
    ok(a.tr && a.tr.pickthall && a.tr.sahih, `${file} ${c.id}:${a.n}: missing translations`);
    for (const w of a.words) {
      ok(typeof w.ar === 'string' && w.ar.length > 0, `${file} ${c.id}:${a.n} w${w.n}: empty word`);
      ok(/^wbw\/\d{3}_\d{3}_\d{3}\.mp3$/.test(w.audio), `${file} ${c.id}:${a.n} w${w.n}: bad audio ref "${w.audio}"`);
      ok(!/[\u200E\u200F]/.test(w.ar), `${file} ${c.id}:${a.n} w${w.n}: zero-width char in word`);
    }
    // Word text must rejoin to the ayah text (normalised, conventions ignored).
    const stripChk = (s) => s.normalize('NFC')
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200E\u200F\uFEFF]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0621\u0627/g, '\u0627');
    const joinedWords = a.words.map((w) => stripChk(w.ar).trim()).filter(Boolean).join(' ');
    const joinedText = a.text.split(/\s+/).map(stripChk).filter(Boolean).join(' ');
    ok(joinedWords === joinedText, `${file} ${c.id}:${a.n}: words[] do not rejoin to the ayah text`);
    // Audio refs must be the word's own clip: wbw/sss_aaa_<pos>.mp3 where pos
    // is the word's compacted index (1-based). The CDN numbers files
    // contiguously; quran.com's audio_url counts pause-mark slots and is off
    // by one after every pause mark — never trust it (Oct 2026 finding).
    a.words.forEach((w, wi) => {
      const want = `wbw/${String(c.id).padStart(3, '0')}_${String(a.n).padStart(3, '0')}_${String(wi + 1).padStart(3, '0')}.mp3`;
      ok(w.n === wi + 1, `${file} ${c.id}:${a.n} w${w.n}: position not compacted (index ${wi + 1})`);
      ok(w.audio === want, `${file} ${c.id}:${a.n} w${wi + 1}: audio ref "${w.audio}" != "${want}"`);
    });
  }
}
ok(expectedGlobal === 6236, `total ayahs walked: ${expectedGlobal}, expected 6236`);

// Spot checks (verified against the live API during planning):
const s1 = await readJson(path.join(ROOT, 'data', 'quran', '001.json'));
ok(s1.ayahs[0].words.length === 4, `1:1 should have exactly 4 words, has ${s1.ayahs[0].words.length}`);
const s2 = await readJson(path.join(ROOT, 'data', 'quran', '002.json'));
ok(s2.ayahs[0].words.length === 1, `2:1 ("الم") should have exactly 1 word, has ${s2.ayahs[0].words.length}`);

// ---- Seed files ----
const letters = await readJson(path.join(ROOT, 'data', 'letters.json'));
ok(letters.length === 28, `letters.json: expected 28 letters, got ${letters.length}`);
const EXPECTED = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
ok(letters.map((l) => l.ar).join('') === EXPECTED, 'letters.json: isolated forms do not match the canonical 28');
const NON_CONNECTORS = new Set(['alif', 'dal', 'dhal', 'ra', 'zay', 'waw']);
for (const l of letters) {
  const connects = l.connects_forward === true;
  ok(!NON_CONNECTORS.has(l.id) === connects || NON_CONNECTORS.has(l.id) === !connects,
    `letters.json: ${l.id} connects_forward mismatch`);
  if (connects) {
    ok(l.forms.initial && l.forms.medial && l.forms.final, `letters.json: ${l.id} missing connected forms`);
  } else {
    ok(l.forms.initial === null && l.forms.medial === null, `letters.json: ${l.id} should have null initial/medial`);
    ok(!!l.forms.final, `letters.json: ${l.id} missing final form`);
  }
}

const harakat = await readJson(path.join(ROOT, 'data', 'harakat.json'));
ok(harakat.length === 8, `harakat.json: expected 8 entries, got ${harakat.length}`);

const vocab = await readJson(path.join(ROOT, 'data', 'vocabulary.json'));
ok(vocab.words.length >= 100, `vocabulary.json: expected >= 100 words, got ${vocab.words.length}`);
for (const w of vocab.words) {
  ok(w.ar && w.translit && w.gloss && w.audio, `vocabulary.json: rank ${w.rank} missing fields`);
}

const rootsData = await readJson(path.join(ROOT, 'data', 'roots.json'));
ok(rootsData.count >= 20, `roots.json: expected >= 20 families, got ${rootsData.count}`);
for (const f of rootsData.roots) {
  ok(f.id && f.root && f.note, `roots.json: family ${f.id} missing fields`);
  ok(f.members.length >= 2, `roots.json: family ${f.id} has < 2 members`);
  for (const m of f.members) {
    ok(m.ar && m.translit && m.gloss && /^\d{1,3}:\d{1,3}$/.test(m.ref) && m.audio, `roots.json: ${f.id} member fields bad`);
  }
}

const reciters = await readJson(path.join(ROOT, 'data', 'reciters.json'));
ok(reciters.length >= 3, `reciters.json: expected >= 3, got ${reciters.length}`);
for (const r of reciters) ok(r.edition && r.bitrate, `reciters.json: ${r.id} missing edition/bitrate`);

const terms = await readJson(path.join(ROOT, 'data', 'grammar-terms.json'));
ok(terms.length >= 5, `grammar-terms.json: expected >= 5 terms, got ${terms.length}`);

const notes = await readJson(path.join(ROOT, 'data', 'verse-notes.json'));
for (const [key, list] of Object.entries(notes)) {
  ok(/^\d{1,3}:\d{1,3}$/.test(key), `verse-notes.json: bad key "${key}"`);
  ok(Array.isArray(list) && list.every((x) => x.n > 0 && x.note), `verse-notes.json: bad entry under ${key}`);
}

if (errs.length) {
  console.error(`FAILED with ${errs.length} problem(s):`);
  for (const e of errs.slice(0, 40)) console.error(' -', e);
  process.exit(1);
}
console.log(`OK: 114 surahs / ${expectedGlobal} ayahs / 28 letters / 8 harakat / ${vocab.words.length} words / ${rootsData.count} roots / ${reciters.length} reciters`);
