// Tests for the letter-joining logic (js/lib/shaping.js) and the Build-mode
// word list (data/build-words.json). Run: node --test tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, joinPlan, bareForm } from '../js/lib/shaping.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const letters = JSON.parse(await readFile(path.join(ROOT, 'data', 'letters.json'), 'utf8'));
const index = buildIndex(letters);

const formsOf = (bare) => joinPlan(bare, index).plan.map((p) => `${p.id}:${p.formName}`);

test('forms: كتاب (book) — initial, medial, final, isolated', () => {
  assert.deepEqual(formsOf('كتاب'), ['kaf:initial', 'ta:medial', 'alif:final', 'ba:isolated']);
});

test('forms: باب (door) — the alif breaks the chain before the final ب', () => {
  assert.deepEqual(formsOf('باب'), ['ba:initial', 'alif:final', 'ba:isolated']);
});

test('forms: مكتوب — و never joins forward, so ب goes back to isolated', () => {
  assert.deepEqual(formsOf('مكتوب'), [
    'mim:initial',
    'kaf:medial',
    'ta:medial',
    'waw:final',
    'ba:isolated',
  ]);
});

test('forms: سموت — the waw takes the final form, then breaks the chain', () => {
  assert.deepEqual(formsOf('سموت'), ['sin:initial', 'mim:medial', 'waw:final', 'ta:isolated']);
});

test('joinPlan flags unknown letters (hamza forms are not tiles)', () => {
  const r = joinPlan('ابدأ', index);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['أ']);
});

test('bareForm strips all marks, tatweel and alef wasla', () => {
  assert.equal(bareForm('كِتَـٰبُ'), 'كتب'); // dagger alef + tatweel removed
  assert.equal(bareForm('ٱلرَّحْمَٰنِ'), 'الرحمن'); // wasla + shadda + marks removed
  assert.equal(bareForm('يَوْمِ'), 'يوم');
});

test('build-words.json: every word decomposes, 40 words, all fields consistent', async () => {
  const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'build-words.json'), 'utf8'));
  assert.equal(data.words.length, 40);
  const alphabet = new Set(letters.map((l) => l.ar));
  for (const w of data.words) {
    assert.equal(bareForm(w.ar), w.bare, `${w.bare}: bare form must equal its vowelled form minus marks`);
    assert.ok(w.bare.length >= 3 && w.bare.length <= 5, `${w.bare}: length`);
    for (const ch of w.bare) assert.ok(alphabet.has(ch), `${w.bare}: ${ch} not in the 28 letters`);
    const { plan, ok } = joinPlan(w.bare, index);
    assert.ok(ok, `${w.bare}: decomposes cleanly`);
    assert.deepEqual(plan.map((p) => p.id), w.letters, `${w.bare}: stored letters match the plan`);
    assert.equal(w.first, w.letters[0], `${w.bare}: first letter`);
    assert.ok(w.gloss && w.gloss.length > 1, `${w.bare}: gloss present`);
    assert.ok(/^wbw\/\d{3}_\d{3}_\d{3}\.mp3$/.test(w.audio), `${w.bare}: audio ref`);
    assert.ok(/^\d+:\d+$/.test(w.ref), `${w.bare}: ref format`);
  }
});

test('build-words.json: no non-connector is stored as initial/medial', async () => {
  const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'build-words.json'), 'utf8'));
  for (const w of data.words) {
    const { plan } = joinPlan(w.bare, index);
    for (const p of plan) {
      const entry = letters.find((l) => l.id === p.id);
      if (!entry.forms.initial && !entry.forms.medial) {
        assert.ok(['isolated', 'final'].includes(p.formName), `${w.bare}: ${p.id} must not take ${p.formName}`);
      }
    }
  }
});
