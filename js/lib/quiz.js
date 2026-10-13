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
