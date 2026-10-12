// Quick integrity probe for the generated dataset.
// Usage: node tools/spotcheck.mjs 2:255
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] ?? '1:1';
const m = arg.match(/^(\d{1,3}):(\d{1,3})$/);
if (!m) {
  console.error('usage: node tools/spotcheck.mjs SURAH:AYAH  (e.g. 2:255)');
  process.exit(1);
}
const s = Number(m[1]);
const a = Number(m[2]);
const file = path.join(ROOT, 'data', 'quran', `${String(s).padStart(3, '0')}.json`);
const data = JSON.parse(await readFile(file, 'utf8'));
const verse = data.ayahs.find((v) => v.n === a);
if (!verse) {
  console.error(`ayah ${s}:${a} not found (surah has ${data.ayahs.length} ayahs)`);
  process.exit(1);
}
console.log(`surah: ${data.id} ${data.name_simple} (bismillah_pre=${data.bismillah_pre})`);
console.log(`ayah: ${verse.n} global=${verse.global}`);
console.log(`text: ${verse.text.slice(0, 70)}${verse.text.length > 70 ? '...' : ''}`);
console.log(`words: ${verse.words.length}`);
const w = verse.words[0];
console.log(`first word: ${w.ar} | ${w.translit} | ${w.gloss}`);
console.log(`audio: https://audio.qurancdn.com/${w.audio}`);
console.log(`translations: pickthall=${verse.tr.pickthall ? 'yes' : 'MISSING'} sahih=${verse.tr.sahih ? 'yes' : 'MISSING'}`);
console.log(`tashkeel present: ${/[\u064B-\u0652\u0670]/.test(verse.text)}`);
