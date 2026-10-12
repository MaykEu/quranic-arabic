// Audio URL builders for the two external CDNs. Verified live 2026-10-12 (see plan Appendix A):
//  - word-by-word  https://audio.qurancdn.com/wbw/sss_aaa_www.mp3        (QuranCDN, no auth)
//  - full verse    https://cdn.islamic.network/quran/audio/{rate}/{edition}/{global}.mp3  (islamic.network)
//  - fallback      https://everyayah.com/data/{folder}/sssaaa.mp3       (mirror, only where verified)
export const WBW_BASE = 'https://audio.qurancdn.com';
export const VERSE_BASE = 'https://cdn.islamic.network/quran/audio';
export const EVERYAYAH = 'https://everyayah.com/data';

export const pad3 = (n) => String(n).padStart(3, '0');

// Word-by-word: surah_ayah_word, each 3-digit zero-padded.
export const wbwUrl = (surah, ayah, word) =>
  `${WBW_BASE}/wbw/${pad3(surah)}_${pad3(ayah)}_${pad3(word)}.mp3`;

// Stored refs look like "wbw/002_255_001.mp3" (as produced by the data pipeline).
export const wbwFromRef = (ref) => `${WBW_BASE}/${ref}`;

// Full verse: {bitrate, edition} from data/reciters.json; global = cumulative ayah index (1..6236).
export const verseAudioUrl = (reciter, globalIndex) =>
  `${VERSE_BASE}/${reciter.bitrate}/${reciter.edition}/${globalIndex}.mp3`;

// Fallback mirror — only for reciters with a `backup` folder (e.g. Alafasy_128kbps).
export const everyayahUrl = (reciter, surah, ayah) =>
  `${EVERYAYAH}/${reciter.backup}/${pad3(surah)}${pad3(ayah)}.mp3`;

// Cumulative ayah index: counts = per-surah verses_count array (from data/quran/index.json).
export const globalAyahIndex = (counts, surah, ayah) =>
  counts.slice(0, surah - 1).reduce((t, n) => t + n, 0) + ayah;
