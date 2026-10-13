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

// Practice routes: "#read/2:255", "#recall", "#trace", "#listen".
// → { mode: 'read'|'trace'|'listen'|'recall', s: number|null, a: number|null }
export function parsePracticeHash(h = location.hash) {
  const raw = String(h).replace(/^#/, '');
  const [rawMode, ref] = raw.split('/');
  const mode = ['read', 'trace', 'listen', 'recall'].includes(rawMode) ? rawMode : 'read';
  const vr = ref ? parseVerseRef(ref) : null;
  return { mode, s: vr ? vr.s : null, a: vr ? vr.a : null };
}
