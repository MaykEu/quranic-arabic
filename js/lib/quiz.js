// Recognition-drill helpers (Practice "Quiz" mode): building option sets, rounds,
// and the trace/listen pools. Pure functions with an injectable rng so tests stay
// deterministic.
import { bareForm } from './shaping.js';

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

// ALL tokens, function words included — used for the particle fallback below.
export const glossFullTokens = (gloss) =>
  String(gloss || '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const normGloss = (g) => String(g || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();

// The four options for a meaning question: the answer's gloss + three glosses that
// can never also fit — so the question is always fair.
//   • content answers ("the day of judgement"): distractors must share NO significant
//     word (function words ignored), and must themselves carry a significant word.
//   • particle answers ("from", "in", "what"): compared on ALL tokens (function words
//     included), so "from" is quizzed against "in / what / they" and never "from it".
// Returns null when there aren't enough clean distractors (caller skips the word).
export function glossOptions(answer, pool, n = 4, rng = Math.random) {
  const aSig = new Set(glossTokens(answer.gloss));
  const aFull = new Set(glossFullTokens(answer.gloss));
  if (!aFull.size) return null;
  const seen = new Set([normGloss(answer.gloss)]);
  const clean = [];
  for (const w of pool) {
    if (w.rank === answer.rank) continue;
    const key = normGloss(w.gloss);
    if (!key || seen.has(key)) continue;
    if (aSig.size) {
      const sig = glossTokens(w.gloss);
      if (!sig.length) continue; // content answers get content distractors
      if (sig.some((t) => aSig.has(t))) continue;
    } else {
      const full = glossFullTokens(w.gloss);
      if (full.some((t) => aFull.has(t))) continue;
    }
    seen.add(key);
    clean.push(w);
  }
  if (clean.length < n - 1) return null;
  return shuffle([answer, ...shuffle(clean, rng).slice(0, n - 1)], rng);
}

// ---------- drill pools (Trace / Listen) ----------

// Trace: the curated build words + every word short enough to trace comfortably
// (≤ `maxBare` letters once the marks are stripped — tracing a 10-letter word with
// tashkeel is misery). Listen: every word — the audio makes length irrelevant.
// Both pools are deduped by bare form and keep {bare, ar, audio, translit, gloss}.
export function buildDrillPools(buildWords, vocab, maxBare = 6) {
  const map = (w, i) => ({
    id: w.rank != null ? w.rank : `b${i}`,
    bare: w.bare || bareForm(w.ar),
    ar: w.ar,
    audio: w.audio,
    translit: w.translit,
    gloss: w.gloss,
  });
  const build = (buildWords || []).map(map);
  const vocabMapped = (vocab || []).map(map);
  const inBuild = new Set(build.map((w) => w.bare));
  const extra = vocabMapped.filter((w) => w.bare && !inBuild.has(w.bare));
  return {
    build,
    trace: [...build, ...extra.filter((w) => w.bare.length <= maxBare)],
    listen: [...build, ...extra],
  };
}
