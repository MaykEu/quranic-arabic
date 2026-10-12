// Build data/build-words.json — the curated word list for the Build mode.
//
// Source of truth is the corpus itself: candidates are the distinct "bare"
// word forms (marks stripped) of the whole Quran, filtered to what a beginner
// can build from the 28 alphabet letters:
//   - 3-5 letters,   - only the 28 letters (no hamza forms, no ة/ى variants),
//   - no shadda in the written form,
//   - no dagger alef / tatweel / alef wasla occurrences (Uthmani conventions
//     a beginner shouldn't meet in the build game).
// Gloss/transliteration/audio are taken from the existing word-by-word corpus
// data at a chosen occurrence (never invented). CURATED below is the final
// selection; an entry is either 'bare' (use the most common reading) or
// { bare, ref } to pin one specific verified occurrence.
//
// Usage:
//   node tools/build-words.mjs                  → writes data/build-words.json
//   node tools/build-words.mjs --report         → candidate table (tools/build-words-candidates.md)
//   node tools/build-words.mjs --show a,b,c     → all clean occurrences of the given bare forms
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, bareForm } from '../js/lib/shaping.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QURAN = path.join(ROOT, 'data', 'quran');

// The curated selection — concrete, beginner-friendly words. { bare, ref } pins
// a specific verified occurrence (so gloss/audio/transliteration all agree;
// refs chosen so the word-by-word clip verifiably exists on the CDN).
const CURATED = [
  'يوم', { bare: 'عذاب', ref: '2:10' }, 'عند', 'خير', 'قبل', 'سبيل', 'خلق', 'بين', 'قوم', 'كيف',
  'فرعون', 'علم', { bare: 'نفس', ref: '2:123' }, { bare: 'ملك', ref: '12:31' },
  'نار', 'رسل', 'وجه', 'عين', 'دين', { bare: 'طين', ref: '6:2' },
  { bare: 'ظلم', ref: '40:17' }, 'نور', { bare: 'عبد', ref: '43:59' },
  'بيت', 'ريح', 'لسان', 'جبل', { bare: 'كتاب', ref: '18:27' },
  { bare: 'حكم', ref: '5:43' }, 'فلك', 'بحر', { bare: 'سمع', ref: '3:181' },
  'صبر', 'شكر', { bare: 'قلب', ref: '50:37' }, { bare: 'عرش', ref: '27:23' },
  { bare: 'لحم', ref: '6:145' }, { bare: 'ذنب', ref: '81:9' }, 'رزق', 'طور',
];

// Keep glosses from the data, only tidying grammar filler:
//   "(is) a punishment" → "a punishment" · "(is the) dominion" → "the dominion"
const tidyGloss = (s) =>
  s
    .replace(/^\(([^)]+)\)\s*/, (_, inner) => {
      const art = inner.match(/\b(the|a|an|A)\b/);
      return art ? `${art[1]} ` : '';
    })
    .replace(/\s+/g, ' ')
    .trim();

const letters = JSON.parse(await readFile(path.join(ROOT, 'data', 'letters.json'), 'utf8'));
const index = buildIndex(letters);
const alphabet = new Set(letters.map((l) => l.ar));

const files = (await readdir(QURAN)).filter((f) => /^\d{3}\.json$/.test(f)).sort();
if (files.length !== 114) {
  console.error(`expected 114 surah files in data/quran, found ${files.length} — run the fetch first`);
  process.exit(1);
}

// Scan: bare form -> { count, glosses: Map(gloss -> {count, first}), all: [...] }
const counts = new Map();
for (const f of files) {
  const surah = JSON.parse(await readFile(path.join(QURAN, f), 'utf8'));
  for (const ayah of surah.ayahs) {
    for (const w of ayah.words) {
      const bare = bareForm(w.ar);
      if (!bare || bare.length < 3 || bare.length > 5) continue;
      if (![...bare].every((ch) => alphabet.has(ch))) continue;
      if (/[\u0651]/.test(w.ar)) continue; // shadda — skip in v1
      if (/[\u0670\u0640\u0671]/.test(w.ar)) continue; // dagger / tatweel / alef wasla
      const occ = { ar: w.ar, translit: w.translit, gloss: w.gloss, audio: w.audio, ref: `${surah.id}:${ayah.n}` };
      let rec = counts.get(bare);
      if (!rec) {
        rec = { count: 0, glosses: new Map(), all: [] };
        counts.set(bare, rec);
      }
      rec.count += 1;
      rec.all.push(occ);
      const g = rec.glosses.get(w.gloss) || { count: 0, first: occ };
      g.count += 1;
      rec.glosses.set(w.gloss, g);
    }
  }
}

const bestGloss = (rec) => [...rec.glosses.entries()].sort((a, b) => b[1].count - a[1].count)[0];

// ---- --show mode: print all clean occurrences of the given bare forms ----
const showIdx = process.argv.indexOf('--show');
if (showIdx > -1) {
  for (const bare of process.argv[showIdx + 1].split(',')) {
    const rec = counts.get(bare);
    if (!rec) {
      console.log(`\n### ${bare}: NOT FOUND as a clean candidate`);
      continue;
    }
    console.log(`\n### ${bare} — ${rec.count} clean occurrences`);
    for (const o of rec.all.slice(0, 14)) {
      console.log(`  ${o.ref.padEnd(8)} ${o.ar.padEnd(12)} ${(o.translit || '').padEnd(16)} ${o.gloss}   [${o.audio}]`);
    }
  }
  process.exit(0);
}

// ---- --report mode ----
const ranked = [...counts.entries()]
  .map(([bare, rec]) => {
    const [gloss, g] = bestGloss(rec);
    return { bare, count: rec.count, gloss, sample: g.first };
  })
  .sort((a, b) => b.count - a.count);

if (process.argv.includes('--report')) {
  const md = [
    '| # | bare | count | best gloss | vowelled | translit | first ref |',
    '|---|---|---|---|---|---|---|',
    ...ranked.map((r, i) => `| ${i + 1} | ${r.bare} | ${r.count} | ${r.gloss} | ${r.sample.ar} | ${r.sample.translit} | ${r.sample.ref} |`),
  ];
  await writeFile(path.join(ROOT, 'tools', 'build-words-candidates.md'), md.join('\n') + '\n');
  console.log(`candidates: ${ranked.length} (written to tools/build-words-candidates.md)`);
  for (const [i, r] of ranked.slice(0, 60).entries()) {
    console.log(`${String(i + 1).padStart(3)}  ${r.bare.padEnd(8)} ${String(r.count).padStart(5)}×  ${r.gloss}   [${r.sample.ar} · ${r.sample.translit} · ${r.sample.ref}]`);
  }
  process.exit(0);
}

// ---- write the curated build-words.json ----
const words = [];
const problems = [];
for (const entry of CURATED) {
  const bare = typeof entry === 'string' ? entry : entry.bare;
  const wantRef = typeof entry === 'string' ? null : entry.ref;
  const rec = counts.get(bare);
  if (!rec) {
    problems.push(`${bare}: not found as a clean candidate`);
    continue;
  }
  let occ;
  if (wantRef) {
    occ = rec.all.find((o) => o.ref === wantRef);
    if (!occ) {
      problems.push(`${bare}: no clean occurrence at ${wantRef} (have: ${[...new Set(rec.all.map((o) => o.ref))].slice(0, 12).join(', ')})`);
      continue;
    }
  } else {
    occ = bestGloss(rec)[1].first;
  }
  const chars = [...bare];
  const missing = chars.filter((ch) => !index.entry(ch));
  if (missing.length) {
    problems.push(`${bare}: unknown letters ${missing.join(' ')}`);
    continue;
  }
  const plan = chars.map((ch, i) => {
    const e = index.entry(ch);
    const prev = i > 0 ? chars[i - 1] : null;
    const connectedRight = !!prev && index.canLeftJoin(index.entry(prev));
    const connectedLeft = i < chars.length - 1 && index.canLeftJoin(e);
    return { id: e.id, connectedRight, connectedLeft, form: index.formFor(e, connectedRight, connectedLeft) };
  });
  words.push({
    bare,
    ar: occ.ar,
    translit: occ.translit,
    gloss: tidyGloss(occ.gloss),
    count: rec.count,
    ref: occ.ref,
    audio: occ.audio,
    letters: plan.map((p) => p.id),
    first: plan[0].id,
  });
}
if (problems.length) {
  console.error('problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

await writeFile(
  path.join(ROOT, 'data', 'build-words.json'),
  JSON.stringify({ generated: new Date().toISOString(), count: words.length, words }, null, 1),
);
console.log(`build-words.json written: ${words.length} words`);
for (const w of words) console.log(`  ${w.bare.padEnd(8)} ${String(w.count).padStart(4)}×  ${w.gloss.padEnd(24)} [${w.letters.join(' ')}]  ${w.ar}  (${w.ref})`);
