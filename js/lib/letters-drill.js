// Letter drills: option builders + round order. Pure functions with an
// injectable rng — unit-tested in tests/letters-drill.test.js.
//
// The design choice that matters: distractors come from the letter's
// CONFUSABLE family first (data/letter-groups.json), so the learner is always
// choosing between letters that really do look alike (ب ت ث ن ي) rather than
// between random ones. Discrimination — not recognition in isolation — is the
// skill reading demands, and it is exactly what untrained learners fail at.
import { shuffle } from './quiz.js';

export const POSITIONS = ['isolated', 'initial', 'medial', 'final'];

// One stable id space for letter SRS cards (vocabulary uses bare ranks, build
// words 'b:', verses 'v:'). Vowels use their own space so the report can show
// them separately.
export const letterKey = (id) => `L:${id}`;
export const vowelKey = (id) => `M:${id}`;

const familiesOf = (id, groups) => (groups || []).filter((g) => g.includes(id));

// Distractors: same confusable family first, then any other letter.
function distractorsFor(answer, pool, groups, n, rng) {
  const strongIds = new Set();
  for (const g of familiesOf(answer.id, groups)) {
    for (const id of g) if (id !== answer.id) strongIds.add(id);
  }
  const strong = pool.filter((l) => strongIds.has(l.id));
  const weak = pool.filter((l) => !strongIds.has(l.id) && l.id !== answer.id);
  const out = shuffle(strong, rng).slice(0, n);
  if (out.length < n) out.push(...shuffle(weak, rng).slice(0, n - out.length));
  return out;
}

// Sound → written letter (the question plays the letter's name; the options are
// the isolated glyphs).
export function letterOptions(answer, letters, groups, n = 4, rng = Math.random) {
  const d = distractorsFor(answer, letters, groups, n - 1, rng);
  if (d.length < n - 1) return null;
  return shuffle([answer, ...d], rng);
}

// Form → letter: show ONE positional form (initial / medial / final / isolated)
// and ask which letter it is. Every option is rendered in the SAME position, so
// the comparison is fair, and only letters that HAVE that form are offered.
export function formQuestion(answer, letters, groups, n = 4, rng = Math.random) {
  const have = POSITIONS.filter((p) => answer.forms && answer.forms[p]);
  if (!have.length) return null;
  const position = shuffle(have, rng)[0];
  const pool = letters.filter((l) => l.forms && l.forms[position] && l.id !== answer.id);
  const d = distractorsFor(answer, pool, groups, n - 1, rng);
  if (d.length < n - 1) return null;
  return { position, options: shuffle([answer, ...d], rng) };
}

// Vowel marks (harakat): see the mark on a letter → pick its name.
export function vowelOptions(answer, harakat, n = 4, rng = Math.random) {
  const others = harakat.filter((h) => h.id !== answer.id);
  if (others.length < n - 1) return null;
  return shuffle([answer, ...shuffle(others, rng).slice(0, n - 1)], rng);
}

// Round order: things that are DUE first (the spacing schedule does the work),
// then items never seen, then anything — so the drill is useful from day one
// and still respects the boxes. `keyFn` selects the SRS id space (letters by
// default; vowels pass their own).
export function letterRound(items, dueKeys, seenKeys, n = 10, rng = Math.random, keyFn = (x) => letterKey(x.id)) {
  const due = new Set(dueKeys);
  const seen = new Set(seenKeys);
  const out = [];
  const push = (l) => {
    if (l && out.length < n && !out.some((x) => x.id === l.id)) out.push(l);
  };
  for (const l of shuffle(items, rng)) if (due.has(keyFn(l))) push(l);
  for (const l of shuffle(items, rng)) if (!seen.has(keyFn(l))) push(l);
  for (const l of shuffle(items, rng)) push(l);
  return out;
}
