import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Deterministic rng.
let seed = 7;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);

const { letterOptions, formQuestion, vowelOptions, letterRound, letterKey, vowelKey, POSITIONS } = await import(
  '../js/lib/letters-drill.js'
);
const letters = JSON.parse(readFileSync(new URL('../data/letters.json', import.meta.url), 'utf8'));
const harakat = JSON.parse(readFileSync(new URL('../data/harakat.json', import.meta.url), 'utf8'));
const groups = JSON.parse(readFileSync(new URL('../data/letter-groups.json', import.meta.url), 'utf8')).groups;

test('the confusable groups are sane and cover every letter', () => {
  const allIds = new Set(letters.map((l) => l.id));
  for (const g of groups) {
    assert.ok(g.length >= 2, `family ${g.join('/')} needs at least two members`);
    assert.equal(new Set(g).size, g.length, `family ${g.join('/')} repeats a letter`);
    for (const id of g) assert.ok(allIds.has(id), `group id ${id} is not a letter`);
  }
  for (const l of letters) {
    assert.ok(groups.some((g) => g.includes(l.id)), `${l.id} is in no confusable family`);
  }
});

test('letterOptions: answer once, all unique, confusable distractors preferred', () => {
  for (const answer of letters) {
    const opts = letterOptions(answer, letters, groups, 4, rng);
    assert.ok(opts, `no options for ${answer.id}`);
    assert.equal(opts.length, 4);
    assert.equal(opts.filter((o) => o.id === answer.id).length, 1);
    assert.equal(new Set(opts.map((o) => o.id)).size, 4);
    // when the family has enough mates, EVERY distractor must come from it
    const family = new Set(groups.filter((g) => g.includes(answer.id)).flat());
    family.delete(answer.id);
    if (family.size >= 3) {
      for (const o of opts.filter((x) => x.id !== answer.id)) {
        assert.ok(family.has(o.id), `${answer.id}: distractor ${o.id} is not in its confusable family`);
      }
    }
  }
});

test('formQuestion: asks a position the letter actually has, options all share it', () => {
  for (const answer of letters) {
    const q = formQuestion(answer, letters, groups, 4, rng);
    assert.ok(q, `no form question for ${answer.id}`);
    assert.ok(POSITIONS.includes(q.position));
    assert.ok(answer.forms[q.position], `${answer.id} asked in a position it does not have`);
    assert.equal(q.options.filter((o) => o.id === answer.id).length, 1);
    assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
    for (const o of q.options) {
      assert.ok(o.forms[q.position], `option ${o.id} has no ${q.position} form — the comparison would be unfair`);
    }
  }
});

test('formQuestion never asks a non-connector in initial/medial', () => {
  for (const answer of letters) {
    for (let i = 0; i < 12; i++) {
      const q = formQuestion(answer, letters, groups, 4, rng);
      if (!answer.connects_forward) assert.ok(q.position === 'isolated' || q.position === 'final', `${answer.id} asked in ${q.position}`);
    }
  }
});

test('vowelOptions: answer once, four unique marks', () => {
  for (const h of harakat) {
    const opts = vowelOptions(h, harakat, 4, rng);
    assert.ok(opts, `no options for ${h.id}`);
    assert.equal(opts.filter((o) => o.id === h.id).length, 1);
    assert.equal(new Set(opts.map((o) => o.display)).size, 4);
  }
});

test('letterRound: due first, then unseen, then anything; never duplicates; size respected', () => {
  const dueKeys = [letterKey('ba'), letterKey('ta')];
  const seenKeys = letters.slice(0, 10).map((l) => letterKey(l.id));
  const round = letterRound(letters, dueKeys, seenKeys, 10, rng);
  assert.equal(round.length, 10);
  assert.equal(new Set(round.map((l) => l.id)).size, 10);
  assert.deepEqual(round.slice(0, 2).map((l) => l.id).sort(), ['ba', 'ta']);
  assert.ok(!seenKeys.includes(letterKey(round[2].id)), 'third pick should be an unseen letter');
  const small = letterRound(letters, [], [], 10, rng);
  assert.equal(small.length, 10);
  const big = letterRound(letters, [], [], 99, rng);
  assert.equal(big.length, 28);
});

test('key spaces never collide with vocabulary or verses', () => {
  assert.ok(letterKey('ba').startsWith('L:'));
  assert.ok(vowelKey('fathah').startsWith('M:'));
  assert.ok(!/^\d+$/.test(letterKey('ba')), 'letter ids must not look like vocabulary ranks');
  assert.ok(!letterKey('ba').startsWith('v:'), 'letter ids must not look like verse refs');
});
