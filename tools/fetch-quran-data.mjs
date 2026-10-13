// Fetch the full Quran dataset (Uthmani text + word-by-word data + translations)
// from the quran.com API v4. Source & exact params verified 2026-10-12 (plan Appendix A).
//
// Output: data/quran/index.json + data/quran/001.json … 114.json
// Usage:  node tools/fetch-quran-data.mjs            (full run, ~5–10 min)
//         node tools/fetch-quran-data.mjs --limit 2  (quick test: surahs 1–2 only)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.quran.com/api/v4';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'quran');

const args = process.argv.slice(2);
const li = args.indexOf('--limit');
const limit = li > -1 ? Number(args[li + 1]) : 114;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(700 * (i + 1));
    }
  }
}

// (Oct 2026: an AUDIO_FIXES entry for 36:52:7 previously corrected an empty
// audio_url assuming pause marks own CDN file slots — STT verification of the
// actual files disproved that. Files are contiguous by word position, so audio
// refs are now derived from the position directly; no special cases exist.)

// Raw word-text corrections where the upstream API's word differs from its own verse
// text (verified against independent Tanzil Uthmani copies, Oct 2026):
const TEXT_FIXES = {
  "5:52:12": "دَآئِرَةٌۭ ۚ",  // upstream split دَائِرَةٌ into two pieces
  "11:13:3": "ٱفْتَرَىٰهُ ۖ",  // upstream used a plain alef instead of ىٰ
};
const fixWordText = (key, s) =>
  (TEXT_FIXES[key] ?? s).replace(/[\u200E\u200F]/g, "");

const clean = (s) =>
  (s ?? '')
    .replace(/^\uFEFF/, '')                 // BOM guard (seen in fallback sources)
    .replace(/<sup[^>]*>.*?<\/sup>/gs, '')  // strip footnote tags from Saheeh International text
    .trim();

const { chapters } = await getJson(`${API}/chapters?language=en`);
if (chapters.length !== 114) throw new Error(`expected 114 chapters, got ${chapters.length}`);

await mkdir(OUT, { recursive: true });
await writeFile(
  path.join(OUT, 'index.json'),
  JSON.stringify({
    generated: new Date().toISOString(),
    surahs: chapters.map((c) => ({
      id: c.id,
      name_simple: c.name_simple,
      name_arabic: c.name_arabic,
      name_translit: c.translated_name?.name ?? '',
      revelation_place: c.revelation_place,
      verses_count: c.verses_count,
      bismillah_pre: c.bismillah_pre,
    })),
  }, null, 1),
);
console.log(`index.json written (${chapters.length} surahs, ${chapters.reduce((t, c) => t + c.verses_count, 0)} ayahs total)`);

let global = 0;
for (const ch of chapters.slice(0, limit)) {
  const ayahs = [];
  let page = 1;
  let pp = null;
  do {
    const q = new URLSearchParams({
      words: 'true',
      word_fields: 'text_uthmani,transliteration,translation',
      fields: 'text_uthmani',
      translations: '19,20', // 19 = Pickthall (public domain) · 20 = Saheeh International
      per_page: '50',
      page: String(page),
    });
    const d = await getJson(`${API}/verses/by_chapter/${ch.id}?${q}`);
    pp = d.pagination;
    for (const v of d.verses) {
      global++;
      const words = (v.words ?? [])
        .filter((w) => w.char_type_name === 'word') // drop the ayah-number "end" marker word
        .map((w) => ({
          n: w.position,
          ar: fixWordText(`${ch.id}:${v.verse_number}:${w.position}`, clean(w.text_uthmani)),
          translit: clean(w.transliteration?.text ?? ''),
          gloss: clean(w.translation?.text ?? ''),
          // The CDN numbers word files contiguously (file _00N = word #N of the
          // verse). quran.com's `audio_url` counts pause-mark slots and drifts
          // +1 after every pause mark — never use it; derive from the position.
          audio: `wbw/${String(ch.id).padStart(3, '0')}_${String(v.verse_number).padStart(3, '0')}_${String(w.position).padStart(3, '0')}.mp3`,
        }));
      const tr = {};
      for (const t of v.translations ?? []) {
        tr[t.resource_id === 19 ? 'pickthall' : 'sahih'] = clean(t.text);
      }
      ayahs.push({ n: v.verse_number, global, text: clean(v.text_uthmani), words, tr });
    }
    page++;
    await sleep(250); // polite pacing
  } while (pp && pp.next_page);

  // fail fast on any pagination/count issue
  if (ayahs.length !== ch.verses_count) {
    throw new Error(`count mismatch surah ${ch.id}: got ${ayahs.length}, expected ${ch.verses_count}`);
  }
  if (!ayahs.every((v, i) => v.n === i + 1)) {
    throw new Error(`verse numbering broken in surah ${ch.id}`);
  }

  const file = `${String(ch.id).padStart(3, '0')}.json`;
  await writeFile(
    path.join(OUT, file),
    JSON.stringify({
      id: ch.id,
      name_simple: ch.name_simple,
      name_arabic: ch.name_arabic,
      verses_count: ch.verses_count,
      bismillah_pre: ch.bismillah_pre,
      ayahs,
    }, null, 1),
  );
  console.log(`ok ${file} ${ch.name_simple} (${ayahs.length} ayahs, global=${global})`);
}
console.log(`DONE surahs=${Math.min(limit, 114)} ayahs=${global}`);
