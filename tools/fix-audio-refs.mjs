// Fix word-by-word audio refs across the whole dataset.
//
// Correct rule (verified by speech-to-text against the actual CDN files, Oct 2026):
//   the clip for a word is  wbw/{surah3}_{ayah3}_{pos3}.mp3
//   where pos = the word's compacted index among the verse's words (1-based),
//   which equals our stored `n`. The CDN numbers files contiguously; quran.com's
//   API `audio_url` counts pause-mark slots and drifts +1 after every pause mark
//   (which is why words after a pause played the wrong clip).
//
// Usage: node tools/fix-audio-refs.mjs            → dry run (report)
//        node tools/fix-audio-refs.mjs --apply    → rewrite data/quran/*.json
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const pad3 = (n) => String(n).padStart(3, '0');

const files = (await readdir(path.join(ROOT, 'data', 'quran'))).filter((f) => /^\d{3}\.json$/.test(f)).sort();
let changed = 0;
let checked = 0;
let bad = 0;
const samples = [];

for (const f of files) {
  const s = JSON.parse(await readFile(path.join(ROOT, 'data', 'quran', f), 'utf8'));
  let dirty = false;
  for (const a of s.ayahs) {
    a.words.forEach((w, i) => {
      checked += 1;
      if (w.n !== i + 1) {
        bad += 1;
        if (bad <= 10) console.log(`POSITION GAP ${s.id}:${a.n}: stored n=${w.n} at index ${i + 1}`);
        return;
      }
      const want = `wbw/${pad3(s.id)}_${pad3(a.n)}_${pad3(i + 1)}.mp3`;
      if (w.audio !== want) {
        changed += 1;
        if (samples.length < 10) samples.push(`${s.id}:${a.n} #${i + 1} [${w.ar}] ${w.audio}  ->  ${want}`);
        w.audio = want;
        dirty = true;
      }
    });
  }
  if (dirty && APPLY && bad === 0) {
    await writeFile(path.join(ROOT, 'data', 'quran', f), JSON.stringify(s, null, 1));
  }
}

console.log(`\nchecked ${checked} word refs · changed ${changed} · position-gaps ${bad}`);
for (const s of samples) console.log('  ', s);
if (bad > 0) {
  console.log('\nABORT: position gaps found — investigate before applying.');
  process.exit(1);
}
console.log(APPLY ? 'APPLIED.' : 'dry run — re-run with --apply.');
