// Tests for deep-link hash helpers (js/lib/hash.js). Run with the whole suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, parseVerseRef, parseSurahRef, verseHash, surahHash, parsePracticeHash } from '../js/lib/hash.js';

test('parseVerseRef accepts surah:ayah', () => {
  assert.deepEqual(parseVerseRef('2:255'), { s: 2, a: 255 });
  assert.deepEqual(parseVerseRef('112:1'), { s: 112, a: 1 });
});

test('parseVerseRef rejects invalid input', () => {
  for (const bad of ['', 'browse', '0:1', '115:1', '2:0', '2', '2:', ':5', '2:255:1', 'a:b', '1000:1']) {
    assert.equal(parseVerseRef(bad), null, `should reject "${bad}"`);
  }
});

test('parseSurahRef accepts 1..114 only', () => {
  assert.deepEqual(parseSurahRef('112'), { s: 112 });
  assert.deepEqual(parseSurahRef('1'), { s: 1 });
  assert.equal(parseSurahRef('0'), null);
  assert.equal(parseSurahRef('115'), null);
  assert.equal(parseSurahRef('2:255'), null);
  assert.equal(parseSurahRef('browse'), null);
});

test('parseHash strips the #', () => {
  assert.equal(parseHash('#2:255'), '2:255');
  assert.equal(parseHash('2:255'), '2:255');
  assert.equal(parseHash(''), '');
});

test('hash builders round-trip through the parsers', () => {
  assert.deepEqual(parseVerseRef(verseHash(18, 10).slice(1)), { s: 18, a: 10 });
  assert.deepEqual(parseSurahRef(surahHash(114).slice(1)), { s: 114 });
});

test('parsePracticeHash: modes and verse refs', () => {
  assert.deepEqual(parsePracticeHash('#read/2:255'), { mode: 'read', s: 2, a: 255 });
  assert.deepEqual(parsePracticeHash('#recall/112:1'), { mode: 'recall', s: 112, a: 1 });
  assert.deepEqual(parsePracticeHash('#trace'), { mode: 'trace', s: null, a: null });
  assert.deepEqual(parsePracticeHash(''), { mode: 'read', s: null, a: null });
  assert.deepEqual(parsePracticeHash('#bogus/2:255'), { mode: 'read', s: 2, a: 255 });
  assert.deepEqual(parsePracticeHash('#read/999:1'), { mode: 'read', s: null, a: null });
});
