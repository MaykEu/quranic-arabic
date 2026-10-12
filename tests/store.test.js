import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage mock (Node has none). Supports length/key(i) like browsers.
const mem = new Map();
globalThis.localStorage = {
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
};

const { get, set, remove, clearAll } = await import('../js/lib/store.js');

test('set/get round-trips JSON values', () => {
  set('theme', 'dark');
  assert.equal(get('theme'), 'dark');
  set('srs', { w1: { box: 2 } });
  assert.deepEqual(get('srs'), { w1: { box: 2 } });
});

test('get returns fallback when key is missing', () => {
  assert.equal(get('nope', 'default'), 'default');
  assert.deepEqual(get('nope', { a: 1 }), { a: 1 });
});

test('get returns fallback on malformed JSON', () => {
  localStorage.setItem('qa.v1.broken', '{oops');
  assert.equal(get('broken', 'safe'), 'safe');
});

test('keys are namespaced with qa.v1.', () => {
  set('x', 1);
  assert.equal(localStorage.getItem('qa.v1.x'), '1');
  assert.equal(localStorage.getItem('x'), null);
});

test('remove deletes a single key', () => {
  set('gone', true);
  remove('gone');
  assert.equal(get('gone', null), null);
});

test('clearAll removes only namespaced keys', () => {
  localStorage.setItem('unrelated', 'keep');
  set('a', 1);
  set('b', 2);
  clearAll();
  assert.equal(get('a', null), null);
  assert.equal(get('b', null), null);
  assert.equal(localStorage.getItem('unrelated'), 'keep');
});
