// Check that every word-by-word clip the app plays actually exists on QuranCDN.
//
// Scope: the clips referenced by data/vocabulary.json (150 words) and
// data/build-words.json (40 words) — everything the Words/Build pages can play.
// For a broken clip, scan the corpus for other occurrences of the same written
// word and find the first clip that really exists (200 + audio/* + sane size).
//
// Usage:
//   node tools/check-audio.mjs            → report only
//   node tools/check-audio.mjs --apply    → rewrite vocabulary.json audio refs;
//                                           print the refs to pin for build words
// (build words are regenerated from tools/build-words.mjs — pin the printed refs
//  there and re-run it, so the data stays reproducible.)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://audio.qurancdn.com/';
const APPLY = process.argv.includes('--apply');

const strip = (s) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0671\u06D6-\u06ED\u0640]/g, '');

// ---- corpus index: word key → all occurrences [{ref, audio}] in order ----
const files = (await readdir(path.join(ROOT, 'data', 'quran'))).filter((f) => /^\d{3}\.json$/.test(f)).sort();
const byExact = new Map(); // exact written form → occurrences
const byNorm = new Map(); // marks-stripped form → occurrences
for (const f of files) {
  const surah = JSON.parse(await readFile(path.join(ROOT, 'data', 'quran', f), 'utf8'));
  for (const ayah of surah.ayahs) {
    for (const w of ayah.words) {
      const ref = `${surah.id}:${ayah.n}`;
      const push = (map, key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ ref, audio: w.audio });
      };
      push(byExact, w.ar);
      push(byNorm, strip(w.ar));
    }
  }
}

async function clipOk(ref) {
  try {
    const res = await fetch(CDN + ref, { redirect: 'follow' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    return type.startsWith('audio/') && buf.byteLength >= 3000 && buf.byteLength <= 400000;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- check both data files ----
const build = JSON.parse(await readFile(path.join(ROOT, 'data', 'build-words.json'), 'utf8'));
const vocab = JSON.parse(await readFile(path.join(ROOT, 'data', 'vocabulary.json'), 'utf8'));

const report = [];
let broken = 0;

async function checkItem(kind, item, key, occurrences) {
  const current = item.audio;
  const ok = await clipOk(current);
  await sleep(50);
  if (ok) {
    report.push({ kind, key, current, status: 'ok' });
    return;
  }
  broken += 1;
  // find a working alternative occurrence (never the same ref)
  let replacement = null;
  for (const occ of occurrences) {
    if (occ.audio === current) continue;
    if (await clipOk(occ.audio)) {
      replacement = occ;
      break;
    }
    await sleep(50);
  }
  report.push({
    kind,
    key,
    current,
    status: 'BROKEN',
    replacement: replacement ? `${replacement.audio}  (ref ${replacement.ref})` : 'NO WORKING ALTERNATIVE FOUND',
  });
}

for (const w of vocab.words) await checkItem('vocab', w, w.ar_norm, byNorm.get(w.ar_norm) || []);
for (const w of build.words) await checkItem('build', w, w.bare, byExact.get(w.ar) || []);

// ---- report ----
const bad = report.filter((r) => r.status !== 'ok');
console.log(`checked ${report.length} clips (150 vocabulary + 40 build words)`);
if (!bad.length) {
  console.log('ALL CLIPS OK');
} else {
  console.log(`\n${broken} broken clip(s):\n`);
  for (const b of bad) {
    console.log(`  [${b.kind}] ${b.key.padEnd(10)} current: ${b.current}`);
    console.log(`           ${String(b.replacement).startsWith('NO') ? '✗' : '→'} ${b.replacement}`);
  }
}

if (APPLY && bad.length) {
  // vocabulary.json: point the clip at a working occurrence of the same form
  let patched = 0;
  for (const b of bad) {
    if (b.kind !== 'vocab' || String(b.replacement).startsWith('NO')) continue;
    const w = vocab.words.find((x) => x.ar_norm === b.key && x.audio === b.current);
    if (w) {
      w.audio = b.replacement.split(' ')[0];
      patched += 1;
    }
  }
  await writeFile(path.join(ROOT, 'data', 'vocabulary.json'), JSON.stringify(vocab, null, 1));
  console.log(`\nvocabulary.json: ${patched} audio ref(s) applied`);
  const buildFixes = bad.filter((b) => b.kind === 'build' && !String(b.replacement).startsWith('NO'));
  if (buildFixes.length) {
    console.log('pin these refs in tools/build-words.mjs CURATED and re-run the generator:');
    for (const b of buildFixes) console.log(`  ${b.key}  →  ${b.replacement}`);
  }
}

process.exit(bad.length ? 1 : 0);
