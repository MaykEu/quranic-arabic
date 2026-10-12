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
          ar: clean(w.text_uthmani),
          translit: clean(w.transliteration?.text ?? ''),
          gloss: clean(w.translation?.text ?? ''),
          audio:
            w.audio_url ??
            `wbw/${String(ch.id).padStart(3, '0')}_${String(v.verse_number).padStart(3, '0')}_${String(w.position).padStart(3, '0')}.mp3`,
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
