// Recognition-drill helpers (Practice "Quiz" mode): building option sets and
// rounds. Pure functions with an injectable rng so tests stay deterministic.

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Options for one question: the answer + (n-1) distinct words from the pool,
// shuffled. Falls back to fewer options if the pool is tiny.
export function pickOptions(answer, pool, n = 4, rng = Math.random) {
  const others = pool.filter((w) => w.rank !== answer.rank);
  const picked = [];
  const used = new Set();
  const want = Math.min(n - 1, others.length);
  while (picked.length < want && used.size < others.length) {
    const i = Math.min(others.length - 1, Math.floor(rng() * others.length));
    const w = others[i];
    if (used.has(w.rank)) continue;
    used.add(w.rank);
    picked.push(w);
  }
  return shuffle([answer, ...picked], rng);
}

// A round: `size` distinct words, shuffled.
export function buildRound(pool, size = 10, rng = Math.random) {
  return shuffle(pool, rng).slice(0, Math.min(size, pool.length));
}

// ---------- meaning mode (hear the word → pick its English gloss) ----------

// Gloss tokens that carry no meaning for disambiguation.
const GLOSS_STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'upon',
  'and', 'or', 'nor', 'not', 'no', 'nor', 'but', 'so', 'as', 'than', 'that', 'this', 'these',
  'those', 'there', 'here', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do',
  'does', 'did', 'has', 'have', 'had', 'will', 'would', 'shall', 'should', 'may', 'might',
  'can', 'could', 'he', 'she', 'it', 'they', 'we', 'you', 'i', 'his', 'her', 'its', 'their',
  'our', 'your', 'my', 'them', 'him', 'us', 'me', 'who', 'whom', 'whose', 'which', 'what',
  'all', 'any', 'some', 'each', 'every', 'both', 'few', 'many', 'much', 'more', 'most',
  'other', 'another', 'such', 'own', 'same', 'too', 'very', 'also', 'only', 'just', 'ever',
  'never', 'again', 'then', 'when', 'where', 'while', 'because', 'if', 'though', 'yet',
]);

export const glossTokens = (gloss) =>
  String(gloss || '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !GLOSS_STOP.has(t));

// The four options for a meaning question: the answer's gloss + three glosses that
// share NO significant word with it — so a distractor can never also "fit".
// Returns null when there aren't enough clean distractors (caller skips the word).
export function glossOptions(answer, pool, n = 4, rng = Math.random) {
  const aTokens = new Set(glossTokens(answer.gloss));
  if (!aTokens.size) return null;
  const seen = new Set([String(answer.gloss).toLowerCase()]);
  const clean = [];
  for (const w of pool) {
    if (w.rank === answer.rank) continue;
    const key = String(w.gloss || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    const toks = glossTokens(w.gloss);
    if (!toks.length) continue;
    if (toks.some((t) => aTokens.has(t))) continue; // shares a meaning word → ambiguous
    seen.add(key);
    clean.push(w);
  }
  if (clean.length < n - 1) return null;
  return shuffle([answer, ...shuffle(clean, rng).slice(0, n - 1)], rng);
}
