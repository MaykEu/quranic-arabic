import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage mock (Node has none).
const mem = new Map();
globalThis.localStorage = {
  get length() {
    return mem.size;
  },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
};

const A = await import('../js/lib/activity.js');
const { set } = await import('../js/lib/store.js');

const D1 = '2026-10-01';
const D2 = '2026-10-02';

test('dayKey is a LOCAL day string and round-trips', () => {
  assert.equal(A.dayKey(new Date(2026, 9, 5, 23, 30)), '2026-10-05');
  assert.equal(A.keyToDate('2026-10-05').getDate(), 5);
});

test('bump adds per-day counters; graded adds the Ok twin only when good', () => {
  mem.clear();
  A.bump('listens', 1, D1);
  A.bump('listens', 2, D1);
  A.graded('reviews', true, D1);
  A.graded('reviews', false, D1);
  assert.deepEqual(A.day(D1), { listens: 3, reviews: 2, reviewsOk: 1 });
  assert.deepEqual(A.day(D2), {});
});

test('repsOf counts every graded answer and listen, nothing else', () => {
  mem.clear();
  A.bump('visits', 1, D1);
  A.bump('listenSec', 300, D1);
  A.bump('listens', 4, D1);
  A.graded('quizRead', true, D1);
  A.graded('quizMeaning', false, D1);
  A.bump('recalls', 3, D1);
  assert.equal(A.repsOf(A.day(D1)), 4 + 1 + 1 + 3);
});

test('setBest keeps the max and never sums', () => {
  mem.clear();
  assert.equal(A.best('bestRead'), 0);
  A.setBest('bestRead', 7);
  A.setBest('bestRead', 5);
  assert.equal(A.best('bestRead'), 7);
  A.setBest('bestRead', 9);
  assert.equal(A.best('bestRead'), 9);
});

test('range returns the last N local days with a gap-tolerant lookup', () => {
  mem.clear();
  A.bump('listens', 5, D2);
  const list = A.range(3, new Date(2026, 9, 2), A.load());
  assert.deepEqual(
    list.map((x) => x.key),
    ['2026-09-30', '2026-10-01', '2026-10-02'],
  );
  assert.equal(A.repsOf(list[2].d), 5);
  assert.equal(A.repsOf(list[0].d), 0);
});

test('accuracy totals graded answers and splits them per drill', () => {
  const t = { reviews: 10, reviewsOk: 9, quizRead: 4, quizReadOk: 3, quizzes: 0 };
  const a = A.accuracy({ ...t, traces: 2, tracesOk: 2, quizMeaning: 4, quizMeaningOk: 4, recalls: 0, recallsOk: 0 });
  assert.equal(a.n, 20);
  assert.equal(a.ok, 18);
  assert.equal(a.pct, 90);
  assert.deepEqual(a.per.reviews, { n: 10, ok: 9, pct: 90 });
  assert.deepEqual(a.per.recalls, { n: 0, ok: 0, pct: null });
});

test('mergeActivity: union of days, per-day per-field max, symmetric', () => {
  const one = { days: { [D1]: { listens: 3, reviews: 2 }, [D2]: { listens: 1 } }, best: { bestRead: 7 } };
  const two = { days: { [D1]: { listens: 5, quizRead: 10 }, [D2]: { listens: 4, reviewsOk: 1 } }, best: { bestRead: 9, bestMeaning: 6 } };
  const m = A.mergeActivity(one, two);
  assert.deepEqual(m.days[D1], { listens: 5, reviews: 2, quizRead: 10 });
  assert.deepEqual(m.days[D2], { listens: 4, reviewsOk: 1 });
  assert.deepEqual(m.best, { bestRead: 9, bestMeaning: 6 });
  assert.deepEqual(A.mergeActivity(two, one), m); // symmetric
  assert.deepEqual(A.mergeActivity(m, m), m); // idempotent
});

test('mergeActivity drops days older than a deliberate reset', () => {
  const one = { days: { [D1]: { listens: 3 }, [D2]: { listens: 2 } }, best: {} };
  const m = A.mergeActivity(one, { days: {}, best: {} }, new Date(2026, 9, 2).getTime());
  assert.equal(m.days[D1], undefined);
  assert.deepEqual(m.days[D2], { listens: 2 });
});

test('migrate absorbs legacy practice.listens once, never overwriting activity', () => {
  mem.clear();
  set('practice', { listens: { [D1]: 6, [D2]: 2 } });
  A.bump('listens', 9, D1); // today already has real activity
  assert.equal(A.migrate(), true);
  assert.equal(A.day(D1).listens, 9); // activity wins
  assert.equal(A.day(D2).listens, 2); // legacy absorbed
  assert.equal(A.migrate(), false); // once only
  set('practice', { listens: { '2026-10-03': 4 } });
  assert.equal(A.migrate(), false);
  assert.equal(A.day('2026-10-03').listens, undefined);
});

test('mergeActivity tolerates junk shapes', () => {
  assert.deepEqual(A.mergeActivity(null, undefined).days, {});
  assert.deepEqual(A.mergeActivity({ days: 'nope' }, { days: { [D1]: { listens: 1 } } }).days, { [D1]: { listens: 1 } });
  assert.deepEqual(A.mergeActivity({ best: 5 }, {}).best, {});
});
