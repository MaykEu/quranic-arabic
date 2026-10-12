import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pad3, wbwUrl, wbwFromRef, verseAudioUrl, everyayahUrl, globalAyahIndex,
} from '../js/lib/audio.js';

test('pad3 zero-pads to 3 digits', () => {
  assert.equal(pad3(7), '007');
  assert.equal(pad3(114), '114');
});

test('wbwUrl builds verified QuranCDN paths', () => {
  assert.equal(wbwUrl(1, 1, 1), 'https://audio.qurancdn.com/wbw/001_001_001.mp3');
  assert.equal(wbwUrl(2, 255, 1), 'https://audio.qurancdn.com/wbw/002_255_001.mp3');
  assert.equal(wbwUrl(114, 6, 3), 'https://audio.qurancdn.com/wbw/114_006_003.mp3');
});

test('wbwFromRef prefixes stored refs', () => {
  assert.equal(wbwFromRef('wbw/002_255_001.mp3'), 'https://audio.qurancdn.com/wbw/002_255_001.mp3');
});

test('verseAudioUrl uses per-reciter bitrate/edition and global index', () => {
  const alafasy = { edition: 'ar.alafasy', bitrate: 128 };
  assert.equal(verseAudioUrl(alafasy, 262), 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/262.mp3');
  const abdulbasit = { edition: 'ar.abdulbasitmurattal', bitrate: 64 };
  assert.equal(verseAudioUrl(abdulbasit, 1), 'https://cdn.islamic.network/quran/audio/64/ar.abdulbasitmurattal/1.mp3');
});

test('everyayahUrl (backup mirror) uses sssaaa form', () => {
  const alafasy = { backup: 'Alafasy_128kbps' };
  assert.equal(everyayahUrl(alafasy, 2, 255), 'https://everyayah.com/data/Alafasy_128kbps/002255.mp3');
});

test('globalAyahIndex maps (surah, ayah) to cumulative index', () => {
  const counts = [7, 286, 200]; // Al-Fatihah, Al-Baqarah, Al-Imran (prefix of the real list)
  assert.equal(globalAyahIndex(counts, 1, 1), 1);
  assert.equal(globalAyahIndex(counts, 2, 255), 262); // 7 + 255 — verified live
  assert.equal(globalAyahIndex(counts, 2, 1), 8);
  assert.equal(globalAyahIndex(counts, 3, 1), 294); // 7 + 286 + 1
});
