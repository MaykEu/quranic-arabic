import test from 'node:test';
import assert from 'node:assert/strict';

const { pickOptions, buildRound, shuffle, glossOptions, glossTokens } = await import('../js/lib/quiz.js');

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
