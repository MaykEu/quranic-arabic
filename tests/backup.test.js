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

const { set, get } = await import('../js/lib/store.js');
const { exportData, validateImport, applyImport, summarize, collect, BACKUP_FILENAME } = await import('../js/lib/backup.js');

test('exportData wraps the qa.v1. namespace with app tag + format', () => {
  mem.clear();
  set('progress', { letters: { alif: {}, ba: {} }, verses: { '1:1': {} }, days: ['2026-10-13'] });
  set('srs', { 1: { box: 3 }, 2: { box: 1 }, 'b:40': { box: 2 }, 'v:1:1': { box: 1 } });
  mem.set('unrelated', 'keep');
  const obj = exportData();
  assert.equal(obj.app, 'quranic-arabic');
  assert.equal(obj.format, 1);
  assert.ok(typeof obj.exported === 'string');
  assert.deepEqual(Object.keys(obj.data).sort(), ['progress', 'srs']);
});

test('summarize counts letters, words, known, verses, reviews, days', () => {
  const s = summarize(collect());
  assert.equal(s.letters, 2);
  assert.equal(s.words, 3); // 1, 2, b:40
  assert.equal(s.known, 1); // box >= 3 → only '1'
  assert.equal(s.verses, 1);
  assert.equal(s.reviews, 4);
  assert.equal(s.days, 1);
});

test('validateImport accepts a genuine backup and rejects junk', () => {
  const good = exportData();
  assert.equal(validateImport(good).ok, true);
  assert.equal(validateImport(null).ok, false);
  assert.equal(validateImport([]).ok, false);
  assert.equal(validateImport({ app: 'other', format: 1, data: {} }).ok, false);
  assert.equal(validateImport({ app: 'quranic-arabic', format: 99, data: {} }).ok, false);
  assert.equal(validateImport({ app: 'quranic-arabic', format: 1 }).ok, false);
  assert.equal(validateImport({ app: 'quranic-arabic', format: 1, data: [] }).ok, false);
});

test('applyImport replaces existing data (nothing stale survives)', () => {
  const backup = exportData();
  set('extra', { junk: true });
  mem.set('qa.v1.stale', '"leftover"');
  applyImport(backup);
  assert.equal(get('extra', null), null);
  assert.equal(mem.has('qa.v1.stale'), false);
  assert.equal(get('srs', null)['1'].box, 3);
  assert.equal(mem.get('unrelated'), 'keep'); // outside the namespace, untouched
});

test('round trip preserves data exactly', () => {
  const before = exportData();
  applyImport(before);
  const after = exportData();
  assert.deepEqual(after.data, before.data);
});

test('backup filename is dated', () => {
  assert.match(BACKUP_FILENAME(new Date('2026-10-13T10:00:00Z')), /^quranic-arabic-progress-2026-10-13\.json$/);
});
