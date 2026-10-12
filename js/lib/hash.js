// URL-hash helpers for deep links.
//   verses.html#2:255  → one verse (surah:ayah)
//   verses.html#112    → a surah
// Anything else falls back to the default view (the surah browser).
export function parseHash(h = location.hash) {
  return String(h).replace(/^#/, '').trim();
}

// "2:255" → { s: 2, a: 255 }
export function parseVerseRef(str) {
  const m = String(str).match(/^(\d{1,3}):(\d{1,3})$/);
  if (!m) return null;
  const s = Number(m[1]);
  const a = Number(m[2]);
  return s >= 1 && s <= 114 && a >= 1 ? { s, a } : null;
}

// "112" → { s: 112 }
export function parseSurahRef(str) {
  const m = String(str).match(/^(\d{1,3})$/);
  if (!m) return null;
  const s = Number(m[1]);
  return s >= 1 && s <= 114 ? { s } : null;
}

export const verseHash = (s, a) => `#${s}:${a}`;
export const surahHash = (s) => `#${s}`;
