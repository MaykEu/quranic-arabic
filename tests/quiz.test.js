import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { pickOptions, buildRound, shuffle, glossOptions, glossTokens, glossFullTokens, buildDrillPools } = await import(
  '../js/lib/quiz.js'
);

// Deterministic rng for tests.
let seed = 42;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const pool = [...Array(50)].map((_, i) => ({ rank: i + 1, ar: 'w' + (i + 1) }));

test('pickOptions: 4 options, answer included exactly once, all unique', () => {
  seed = 42;
  for (const answer of [pool[0], pool[17], pool[49]]) {
    const opts = pickOptions(answer, pool, 4, rng);
    assert.equal(opts.length, 4);
    assert.equal(opts.filter((o) => o.rank === answer.rank).length, 1);
    assert.equal(new Set(opts.map((o) => o.rank)).size, 4);
    for (const o of opts) assert.ok(pool.includes(o));
  }
});

test('pickOptions: deterministic under a seeded rng', () => {
  seed = 7;
  const a = pickOptions(pool[3], pool, 4, rng).map((o) => o.rank);
  seed = 7;
  const b = pickOptions(pool[3], pool, 4, rng).map((o) => o.rank);
  assert.deepEqual(a, b);
});

test('pickOptions: tiny pool never loops or duplicates', () => {
  const tiny = pool.slice(0, 3);
  seed = 99;
  const opts = pickOptions(tiny[0], tiny, 4, rng);
  assert.equal(opts.length, 3);
  assert.equal(new Set(opts.map((o) => o.rank)).size, 3);
});

test('buildRound: size, uniqueness, subset', () => {
  seed = 123;
  const round = buildRound(pool, 10, rng);
  assert.equal(round.length, 10);
  assert.equal(new Set(round.map((w) => w.rank)).size, 10);
  for (const w of round) assert.ok(pool.includes(w));
});

test('buildRound: clamps to pool size', () => {
  const round = buildRound(pool.slice(0, 4), 10, rng);
  assert.equal(round.length, 4);
});

test('shuffle: keeps multiset, deterministic under seed', () => {
  seed = 5;
  const a = shuffle(pool, rng);
  assert.equal(a.length, pool.length);
  assert.deepEqual([...a].map((w) => w.rank).sort((x, y) => x - y), pool.map((w) => w.rank));
  seed = 5;
  assert.deepEqual(shuffle(pool, rng), a);
});

// ---------- meaning mode: gloss options must never be ambiguous ----------

const vocab = [];
for (let i = 0; i < 60; i++) {
  vocab.push({
    rank: i + 1,
    ar: `كلمة${i}`,
    gloss: ['the Lord of the worlds', 'the day of judgement', 'a sign', 'the book', 'mercy', 'the fire', 'the garden', 'a messenger', 'the earth', 'the sky', 'a path', 'the truth', 'patience', 'gratitude', 'knowledge', 'a servant', 'the night', 'the dawn', 'a valley', 'the sea'][i % 20] + ` ${i}`,
  });
}

test('glossOptions: four unique, includes the answer once, no shared meaning words', () => {
  for (let i = 0; i < 40; i++) {
    const answer = vocab[i];
    const opts = glossOptions(answer, vocab, 4, rng);
    assert.ok(opts, `no options for ${answer.gloss}`);
    assert.equal(opts.length, 4);
    assert.equal(opts.filter((o) => o.rank === answer.rank).length, 1);
    assert.equal(new Set(opts.map((o) => o.rank)).size, 4);
    const aTokens = new Set(glossTokens(answer.gloss));
    for (const o of opts) {
      if (o.rank === answer.rank) continue;
      const shared = glossTokens(o.gloss).filter((t) => aTokens.has(t));
      assert.deepEqual(shared, [], `ambiguous distractor "${o.gloss}" for "${answer.gloss}"`);
    }
  }
});

test('glossOptions: returns null when the pool has no clean distractors', () => {
  const answer = { rank: 1, ar: 'x', gloss: 'the Lord of the worlds' };
  const pool = [answer, { rank: 2, ar: 'y', gloss: 'Lord of all worlds' }, { rank: 3, ar: 'z', gloss: 'the worlds' }];
  assert.equal(glossOptions(answer, pool, 4, rng), null);
});

test('glossOptions: skips candidates whose gloss is only stop-words', () => {
  const answer = { rank: 1, ar: 'x', gloss: 'mercy' };
  const pool = [answer, { rank: 2, ar: 'y', gloss: 'of the' }, { rank: 3, ar: 'z', gloss: 'a sign' }, { rank: 4, ar: 'w', gloss: 'the fire' }, { rank: 5, ar: 'v', gloss: 'patience' }];
  const opts = glossOptions(answer, pool, 4, rng);
  assert.ok(opts);
  assert.ok(!opts.some((o) => o.rank === 2));
});

test('glossOptions: particle glosses get fair options (function-word fallback)', () => {
  const answer = { rank: 1, ar: 'مِن', gloss: 'from' };
  const pool = [
    answer,
    { rank: 2, ar: 'فِى', gloss: 'In' },
    { rank: 3, ar: 'مَا', gloss: 'what' },
    { rank: 4, ar: 'هُمْ', gloss: 'they' },
    { rank: 5, ar: 'مِن', gloss: 'from it' }, // shares 'from' → must be excluded
    { rank: 6, ar: 'لَا', gloss: 'no' },
  ];
  const opts = glossOptions(answer, pool, 4, rng);
  assert.ok(opts);
  assert.ok(!opts.some((o) => o.rank === 5));
  assert.equal(opts.filter((o) => o.rank === 1).length, 1);
  assert.equal(opts.length, 4);
});

test('meaning mode covers the whole vocabulary with fair distractors', () => {
  const vocab = JSON.parse(readFileSync(new URL('../data/vocabulary.json', import.meta.url), 'utf8')).words;
  let ok = 0;
  const skipped = [];
  for (const w of vocab) {
    const opts = glossOptions(w, vocab, 4, rng);
    if (!opts) {
      skipped.push(`${w.rank}:${w.gloss}`);
      continue;
    }
    ok += 1;
    const aSig = new Set(glossTokens(w.gloss));
    const aFull = new Set(glossFullTokens(w.gloss));
    for (const o of opts) {
      if (o.rank === w.rank) continue;
      if (aSig.size) {
        const sig = glossTokens(o.gloss);
        assert.ok(sig.length && !sig.some((t) => aSig.has(t)), `ambiguous distractor "${o.gloss}" for "${w.gloss}"`);
      } else {
        const full = glossFullTokens(o.gloss);
        assert.ok(!full.some((t) => aFull.has(t)), `ambiguous particle distractor "${o.gloss}" for "${w.gloss}"`);
      }
    }
  }
  // recorded invariant: coverage must not silently regress (qa-v31 = 500/500)
  assert.ok(ok >= 499, `meaning coverage dropped to ${ok}/500 — skipped: ${skipped.join(' | ')}`);
});

test('buildDrillPools: trace pool capped by bare length, listen pool takes everything', () => {
  const build = [{ bare: 'كتب', ar: 'كتب', audio: 'a0', translit: 't0', gloss: 'wrote' }];
  const vocab = [
    { rank: 1, ar: 'عِلْم', audio: 'a1', translit: 't1', gloss: 'knowledge' }, // 3 letters → traceable
    { rank: 2, ar: 'ٱلْمَلَـٰٓئِكَةِ', audio: 'a2', translit: 't2', gloss: 'the angels' }, // long → listen only
    { rank: 3, ar: 'كتب', audio: 'a3', translit: 't3', gloss: 'duplicate of a build word' },
  ];
  const pools = buildDrillPools(build, vocab, 6);
  assert.equal(pools.listen.length, 3); // build + 2 distinct vocab words (dup dropped)
  assert.ok(pools.trace.length < pools.listen.length);
  assert.ok(pools.trace.every((w) => w.bare.length <= 6));
  assert.ok(pools.listen.some((w) => w.bare.length > 6));
  assert.ok(pools.listen.every((w) => w.audio && w.bare));
});
