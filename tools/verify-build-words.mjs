// Verify every word in data/build-words.json against the corpus itself:
//   1. the word's ref must be a real ayah that contains that exact written form;
//   2. the audio path must be that occurrence's own word-by-word clip;
//   3. the gloss must equal the corpus gloss (grammar-filler tidied);
//   4. the bare-form frequency must match a fresh filtered scan of the corpus;
//   5. transliteration must be present and equal to the occurrence's.
// Usage: node tools/verify-build-words.mjs   (exit 1 on any failure)
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, bareForm } from '../js/lib/shaping.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'build-words.json'), 'utf8'));
const letters = JSON.parse(await readFile(path.join(ROOT, 'data', 'letters.json'), 'utf8'));
const index = buildIndex(letters);
const alphabet = new Set(letters.map((l) => l.ar));

const tidyGloss = (s) =>
  s
    .replace(/^\(([^)]+)\)\s*/, (_, inner) => {
      const art = inner.match(/\b(the|a|an|A)\b/);
      return art ? `${art[1]} ` : '';
    })
    .replace(/\s+/g, ' ')
    .trim();

// ---- fresh filtered frequency scan (same rules as tools/build-words.mjs) ----
const files = (await readdir(path.join(ROOT, 'data', 'quran'))).filter((f) => /^\d{3}\.json$/.test(f)).sort();
const counts = new Map();
for (const f of files) {
  const surah = JSON.parse(await readFile(path.join(ROOT, 'data', 'quran', f), 'utf8'));
  for (const ayah of surah.ayahs) {
    for (const w of ayah.words) {
      const bare = bareForm(w.ar);
      if (!bare || bare.length < 3 || bare.length > 5) continue;
      if (![...bare].every((ch) => alphabet.has(ch))) continue;
      if (/[\u0651]/.test(w.ar)) continue;
      if (/[\u0670\u0640\u0671]/.test(w.ar)) continue;
      counts.set(bare, (counts.get(bare) || 0) + 1);
    }
  }
}

// ---- per-word checks ----
let fail = 0;
for (const w of data.words) {
  const issues = [];
  const [s, a] = w.ref.split(':').map(Number);
  const surah = JSON.parse(await readFile(path.join(ROOT, 'data', 'quran', `${String(s).padStart(3, '0')}.json`), 'utf8'));
  const ayah = surah.ayahs.find((x) => x.n === a);
  if (!ayah) {
    issues.push('ayah not found');
  } else {
    const word = ayah.words.find((x) => x.ar === w.ar);
    if (!word) {
      issues.push('exact written form not present in the ayah');
    } else {
      if (word.audio !== w.audio) issues.push(`audio: stored ${w.audio} vs corpus ${word.audio}`);
      if (word.translit !== w.translit) issues.push(`translit: stored "${w.translit}" vs corpus "${word.translit}"`);
      if (tidyGloss(word.gloss) !== w.gloss) {
        issues.push(`gloss: stored "${w.gloss}" vs tidied corpus "${tidyGloss(word.gloss)}" (raw "${word.gloss}")`);
      }
    }
  }
  // audio numbering must match the ref
  const m = w.audio.match(/^wbw\/(\d{3})_(\d{3})_(\d{3})\.mp3$/);
  if (!m) issues.push('audio ref malformed');
  else if (Number(m[1]) !== s || Number(m[2]) !== a) issues.push(`audio numbering ${m[1]}_${m[2]} does not match ref ${w.ref}`);

  const fresh = counts.get(w.bare) || 0;
  if (fresh !== w.count) issues.push(`count: stored ${w.count} vs fresh scan ${fresh}`);

  const { ok, plan, missing } = (() => {
    const chars = [...w.bare];
    const missing = chars.filter((ch) => !index.entry(ch));
    return { ok: missing.length === 0, missing, plan: chars.map((ch) => index.entry(ch)?.id) };
  })();
  if (!ok) issues.push(`unknown letters ${missing.join(' ')}`);
  else if (plan.join() !== w.letters.join()) issues.push('letters array mismatch');

  if (issues.length) {
    fail += 1;
    console.log(`FAIL  ${w.bare}  → ${issues.join('  |  ')}`);
  } else {
    console.log(`ok    ${w.bare.padEnd(7)} ${String(w.count).padStart(4)}×  ${w.gloss.padEnd(22)} ${w.ar.padEnd(9)} ${w.translit.padEnd(14)} ${w.ref}  ${w.audio}`);
  }
}
console.log(`\n${fail ? `${fail} FAILURES` : `ALL ${data.words.length} WORDS VERIFIED`}`);
process.exit(fail ? 1 : 0);
