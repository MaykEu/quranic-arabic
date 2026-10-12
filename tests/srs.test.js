import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage mock (Node has none).
const mem = new Map();
globalThis.localStorage = {
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
};

const { review, load, dueIds, stats, INTERVALS } = await import('../js/lib/srs.js');

const DAY = 86400000;
const T0 = 1_700_000_000_000;

test('first good review puts the card in box 1, due in 1 day', () => {
  const e = review('1', true, T0);
  assert.equal(e.box, 1);
  assert.equal(e.due, T0 + 1 * DAY);
});

test('consecutive good reviews walk the expanding intervals', () => {
  review('2', true, T0);            // box 1 → due +1d
  const e2 = review('2', true, T0); // box 2 → due +3d
  assert.equal(e2.box, 2);
  assert.equal(e2.due, T0 + 3 * DAY);
  const e3 = review('2', true, T0); // box 3 → due +7d
  assert.equal(e3.due, T0 + 7 * DAY);
});

test('box is capped at the last interval', () => {
  let e;
  for (let i = 0; i < 8; i++) e = review('3', true, T0);
  assert.equal(e.box, INTERVALS.length);
  assert.equal(e.due, T0 + 30 * DAY);
});

test('a miss resets to box 0 and comes due immediately', () => {
  review('4', true, T0);
  review('4', true, T0);
  const e = review('4', false, T0);
  assert.equal(e.box, 0);
  assert.equal(e.due, T0);
});

test('dueIds returns only cards whose due time has passed', () => {
  review('5', true, T0);             // due T0 + 1d
  assert.equal(dueIds(load(), T0).includes('5'), false);
  assert.equal(dueIds(load(), T0 + 2 * DAY).includes('5'), true);
});

test('stats classifies learning vs known', () => {
  const all = {};
  all['k1'] = { box: 3, seen: 3, right: 3, due: 0 };
  all['k2'] = { box: 5, seen: 5, right: 5, due: 0 };
  all['l1'] = { box: 1, seen: 1, right: 1, due: 0 };
  const s = stats(all);
  assert.equal(s.known, 2);
  assert.equal(s.learning, 1);
  assert.equal(s.seen, 3);
});
