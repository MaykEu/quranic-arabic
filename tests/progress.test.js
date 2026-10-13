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

const { mark, unmark, isLearned, count, activeDays, resetAll } = await import('../js/lib/progress.js');
const { get } = await import('../js/lib/store.js');

test('mark / unmark / count round-trip for the memorised bucket', () => {
  mem.clear();
  mark('memorised', '1:1');
  mark('memorised', '1:2');
  assert.equal(count('memorised'), 2);
  assert.ok(isLearned('memorised', '1:1'));
  unmark('memorised', '1:1');
  assert.equal(count('memorised'), 1);
  assert.ok(!isLearned('memorised', '1:1'));
});

test('legacy stored objects without the memorised bucket migrate safely', () => {
  mem.clear();
  localStorage.setItem(
    'qa.v1.progress',
    JSON.stringify({ letters: { alif: { at: 1 } }, words: {}, verses: {}, days: ['2026-10-01'] }),
  );
  mark('memorised', '2:255'); // must not throw on old shapes
  assert.equal(count('memorised'), 1);
  assert.equal(count('letters'), 1); // old data intact
  assert.ok(activeDays().includes('2026-10-01'));
});

test('marking appends today to active days exactly once', () => {
  mem.clear();
  mark('memorised', '112:1');
  mark('memorised', '112:2');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(activeDays().includes(today));
  assert.equal(activeDays().filter((d) => d === today).length, 1);
});

test('malformed stored shapes are repaired, not crashed on', () => {
  mem.clear();
  localStorage.setItem('qa.v1.progress', JSON.stringify({ letters: {}, days: 'oops' }));
  assert.equal(count('memorised'), 0);
  mark('memorised', '1:1');
  assert.ok(Array.isArray(activeDays()));
});

test('resetAll clears memorised too', () => {
  mem.clear();
  mark('memorised', '1:1');
  resetAll();
  assert.equal(count('memorised'), 0);
});

test('surah marks live in their own bucket and unmarking leaves a sync tombstone', () => {
  mem.clear();
  mark('surahs', '112');
  assert.equal(count('surahs'), 1);
  assert.ok(isLearned('surahs', '112'));
  unmark('surahs', '112');
  assert.equal(count('surahs'), 0);
  assert.ok(get('tomb', {})['surahs:112'] > 0);
});
