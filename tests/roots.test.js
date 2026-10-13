import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'roots.json'), 'utf8'));

test('roots.json: a useful number of families, each with >= 2 members', () => {
  assert.ok(data.count >= 20, `expected >= 20 families, got ${data.count}`);
  assert.equal(data.roots.length, data.count);
  for (const f of data.roots) {
    assert.ok(f.id && f.root && f.note, `family ${f.id}: missing id/root/note`);
    assert.ok(f.members.length >= 2, `family ${f.id}: needs >= 2 members`);
  }
});

test('roots.json: member fields are complete and well-formed', () => {
  for (const f of data.roots) {
    const seen = new Set();
    for (const m of f.members) {
      assert.ok(m.ar && m.translit && m.gloss, `${f.id}: member missing fields: ${JSON.stringify(m)}`);
      assert.match(m.ref, /^\d{1,3}:\d{1,3}$/, `${f.id}: bad ref ${m.ref}`);
      assert.match(m.audio, /^wbw\/\d{3}_\d{3}_\d{3}\.mp3$/, `${f.id}: bad audio ${m.audio}`);
      assert.ok(!seen.has(m.ar), `${f.id}: duplicate member ${m.ar}`);
      seen.add(m.ar);
    }
  }
});

test('roots.json: every member exists in the corpus at its stated verse', () => {
  const bySurah = new Map();
  const surahOf = (ref) => {
    const s = Number(ref.split(':')[0]);
    if (!bySurah.has(s)) {
      bySurah.set(s, JSON.parse(readFileSync(path.join(ROOT, 'data', 'quran', String(s).padStart(3, '0') + '.json'), 'utf8')));
    }
    return bySurah.get(s);
  };
  for (const f of data.roots) {
    for (const m of f.members) {
      const surah = surahOf(m.ref);
      const a = Number(m.ref.split(':')[1]);
      const ayah = surah.ayahs.find((x) => x.n === a);
      assert.ok(ayah, `${f.id}: ${m.ref} does not exist`);
      const found = ayah.words.find((w) => w.ar === m.ar && w.audio === m.audio);
      assert.ok(found, `${f.id}: word ${m.ar} not found at ${m.ref} (or audio mismatch)`);
    }
  }
});
