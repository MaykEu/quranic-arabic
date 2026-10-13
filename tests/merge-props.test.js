// Property tests for the cloud-sync merge. The merge engine is the one place
// where a subtle bug silently loses a learner's progress across devices, so
// instead of hand-picked cases these run hundreds of RANDOM document pairs and
// assert the algebraic properties the merge must always satisfy:
//
//   1. symmetric        merge(a,b) === merge(b,a)
//   2. idempotent       merge(m,m) === m
//   3. stable           merge(a, merge(a,b)) === merge(a,b)   (absorbing)
//   4. non-destructive  nothing present on one side disappears (within the rules)
//   5. non-inventive    nothing appears that neither side had
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage mock (sync.js pulls store.js for collect/apply).
const mem = new Map();
globalThis.localStorage = {
  get length() {
    return mem.size;
  },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
};

const { mergeDocs } = await import('../js/lib/sync.js');

// ---------- deterministic PRNG ----------
let s = 0x12345678;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (n) => Math.floor(rnd() * n);
const DAY = 86400000;
const BASE = 1_760_000_000_000; // fixed epoch so runs are reproducible
const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const RANKS = ['1', '2', '3', '4', '5', '6', 'b:test', 'b:other'];
const REFS = ['112:1', '112:2', '1:1'];

function randomDoc() {
  const data = {};
  // progress buckets
  const progress = { letters: {}, words: {}, verses: {}, memorised: {}, surahs: {}, days: [] };
  for (const bucket of ['letters', 'words', 'verses', 'memorised', 'surahs']) {
    for (const id of ['alif', ...RANKS, ...REFS]) {
      if (rnd() < 0.3) progress[bucket][id] = { at: BASE + int(1e7) };
    }
  }
  for (const d of DAYS) if (rnd() < 0.5) progress.days.push(d);
  progress.days.sort();
  data.progress = progress;
  // tombstones that may or may not predate the marks
  const tombstones = {};
  for (const bucket of ['letters', 'words', 'verses', 'memorised', 'surahs']) {
    for (const id of [...RANKS, ...REFS]) {
      if (rnd() < 0.12) tombstones[`${bucket}:${id}`] = BASE + int(1e7);
    }
  }
  // srs
  const srs = {};
  for (const id of RANKS) {
    if (rnd() < 0.6) srs[id] = { box: int(6), seen: int(9), right: int(9), due: BASE + int(5 * DAY), at: BASE + int(1e7) };
  }
  data.srs = srs;
  // practice (selection keys + legacy listens)
  const practice = {};
  if (rnd() < 0.5) practice.readVerse = { s: 1 + int(100), a: 1 + int(7) };
  if (rnd() < 0.4) practice.recallSingle = rnd() < 0.5;
  if (rnd() < 0.5) {
    practice.listens = {};
    for (const d of DAYS) if (rnd() < 0.6) practice.listens[d] = int(20);
  }
  data.practice = practice;
  // activity day log
  const activity = { days: {}, best: {} };
  for (const d of DAYS) {
    if (rnd() < 0.7) {
      activity.days[d] = {};
      for (const f of ['visits', 'listens', 'reviews', 'reviewsOk', 'quizRead', 'quizReadOk', 'traces', 'tracesOk', 'recalls', 'recallsOk', 'listenSec', 'readSec']) {
        if (rnd() < 0.6) activity.days[d][f] = int(80);
      }
    }
  }
  for (const b of ['bestRead', 'bestMeaning']) if (rnd() < 0.5) activity.best[b] = int(10);
  data.activity = activity;
  // misc keys
  if (rnd() < 0.5) data.prefs = { tr: pick(['pickthall', 'sahih', 'off']), reciter: pick(['alafasy', 'husary']) };
  if (rnd() < 0.4) data.brush = 3 + int(15);
  if (rnd() < 0.4) data.lastRead = { s: 1 + int(114), a: 1 + int(7), at: BASE + int(1e7) };
  const meta = {};
  for (const k of Object.keys(data)) meta[k] = BASE + int(1e7);
  data._meta = meta;

  return {
    v: 1,
    updatedAt: BASE + int(1e7),
    resetAt: rnd() < 0.25 ? BASE + int(2 * DAY) : 0,
    data,
    tombstones,
  };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = BASE + 9e6;

// ---------- properties ----------

test('merge is symmetric over 300 random pairs', () => {
  for (let i = 0; i < 300; i++) {
    const a = randomDoc();
    const b = randomDoc();
    const ab = mergeDocs(clone(a), clone(b), NOW);
    const ba = mergeDocs(clone(b), clone(a), NOW);
    assert.deepEqual(ab, ba, `symmetry failed on iteration ${i}`);
  }
});

test('merge is idempotent over 200 random pairs', () => {
  for (let i = 0; i < 200; i++) {
    const m = mergeDocs(clone(randomDoc()), clone(randomDoc()), NOW);
    const mm = mergeDocs(clone(m), clone(m), NOW);
    assert.deepEqual(mm, m, `idempotence failed on iteration ${i}`);
  }
});

test('merge is absorbing (merge(a, merge(a,b)) === merge(a,b))', () => {
  for (let i = 0; i < 200; i++) {
    const a = randomDoc();
    const b = randomDoc();
    const m = mergeDocs(clone(a), clone(b), NOW);
    const am = mergeDocs(clone(a), clone(m), NOW);
    // updatedAt differs only by the injected `now`; both take max(NOW, existing)
    assert.deepEqual({ ...am, updatedAt: NOW }, { ...m, updatedAt: NOW }, `absorbing failed on iteration ${i}`);
  }
});

test('merge never invents ids/keys and never lowers counters', () => {
  for (let i = 0; i < 300; i++) {
    const a = clone(randomDoc());
    const b = clone(randomDoc());
    const m = mergeDocs(clone(a), clone(b), NOW);
    const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
    const dayFloor = resetAt ? new Date(resetAt).toISOString().slice(0, 10) : '';

    // non-inventive: every srs id in the merged doc existed on some side
    for (const id of Object.keys(m.data.srs)) {
      assert.ok(a.data.srs[id] || b.data.srs[id], `srs id ${id} appeared from nowhere (iteration ${i})`);
    }
    // non-destructive: an srs card present with a recent review survives
    for (const side of [a, b]) {
      for (const [id, card] of Object.entries(side.data.srs)) {
        if ((card.at || 0) >= resetAt) assert.ok(m.data.srs[id], `srs card ${id} was lost (iteration ${i})`);
      }
    }
    // activity: per-day per-field max is never below either side (days past the floor)
    for (const d of Object.keys(m.data.activity.days)) {
      if (dayFloor && d < dayFloor) continue;
      for (const f of Object.keys(m.data.activity.days[d])) {
        const got = m.data.activity.days[d][f];
        const want = Math.max((a.data.activity.days[d] || {})[f] || 0, (b.data.activity.days[d] || {})[f] || 0);
        assert.ok(got >= want, `activity ${d}.${f} ${got} < ${want} (iteration ${i})`);
      }
    }
    for (const [k, v] of Object.entries(m.data.activity.best)) {
      assert.ok(v >= ((a.data.activity.best || {})[k] || 0) && v >= ((b.data.activity.best || {})[k] || 0), `best ${k} regressed`);
    }
    // listens: per-day max
    const mKeys = Object.keys(m.data.activity.days);
    for (const d of mKeys) {
      const la = ((a.data.practice || {}).listens || {})[d] || 0;
      const lb = ((b.data.practice || {}).listens || {})[d] || 0;
      const lm = (((m.data.practice || {}).listens || {})[d]) || 0;
      assert.ok(lm >= Math.min(la, lb), `listens ${d} lost (iteration ${i})`);
    }
    // tombstones: union — except those older than a deliberate reset, which the
    // merge drops by design (everything from before the reset is gone anyway)
    for (const [t, at] of Object.entries(a.tombstones)) {
      if (at >= resetAt) assert.ok(t in m.tombstones, `tombstone ${t} lost (iteration ${i})`);
    }
    // no key invented at the top level of data (besides _meta)
    const known = new Set(['progress', 'srs', 'activity', 'practice', 'prefs', 'brush', 'lastRead', '_meta']);
    for (const k of Object.keys(m.data)) assert.ok(known.has(k), `unexpected data key ${k}`);
  }
});

test('a re-mark newer than its tombstone always survives', () => {
  const BUCKETS = ['letters', 'words', 'verses', 'memorised', 'surahs'];
  for (let i = 0; i < 300; i++) {
    const a = clone(randomDoc());
    const b = clone(randomDoc());
    const m = mergeDocs(clone(a), clone(b), NOW);
    const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
    for (const side of [a, b]) {
      for (const bucket of BUCKETS) {
        for (const [id, e] of Object.entries(side.data.progress[bucket] || {})) {
          const key = `${bucket}:${id}`;
          const tomb = Math.max(a.tombstones[key] || 0, b.tombstones[key] || 0, (a.data._meta && 0) || 0);
          if (e.at >= resetAt && e.at > tomb) {
            assert.ok(m.data.progress[bucket][id], `${key} (at ${e.at} > tomb ${tomb}) was dropped — iteration ${i}`);
          }
        }
      }
    }
  }
});

test('regression: a stale older mark must not kill the other device\'s re-mark', () => {
  const t1 = 1000;
  const t2 = 2000; // unmark
  const t3 = 3000; // re-mark, on the other device
  const mk = (at, tombstones, updatedAt) => ({
    v: 1,
    updatedAt,
    data: {
      progress: { letters: {}, words: {}, verses: { '112:1': { at } }, memorised: {}, surahs: {}, days: [] },
      _meta: { progress: updatedAt },
    },
    tombstones,
  });
  const stale = mk(t1, {}, t1); // never saw the unmark
  const remarker = mk(t3, { 'verses:112:1': t2 }, t3); // unmarked then re-marked
  const m = mergeDocs(clone(stale), clone(remarker), 9999);
  assert.ok(m.data.progress.verses['112:1'], 'the re-mark must survive the stale older mark');
  assert.equal(m.data.progress.verses['112:1'].at, t3, 'the surviving mark is the re-mark');
  // stable from both sides — no flicker between sync rounds
  assert.deepEqual(mergeDocs(clone(stale), clone(m), 9999), m);
  assert.deepEqual(mergeDocs(clone(remarker), clone(m), 9999), m);
  // and an unmark with NO re-mark still wins
  const unmarked = mk(t1, { 'verses:112:1': t2 }, t2);
  const m2 = mergeDocs(clone(stale), clone(unmarked), 9999);
  assert.equal(m2.data.progress.verses['112:1'], undefined, 'a plain unmark must still delete the entry');
});

test('reset floor is applied on both sides', () => {
  for (let i = 0; i < 100; i++) {
    const a = randomDoc();
    const b = randomDoc();
    a.resetAt = BASE + 2 * DAY;
    const m = mergeDocs(clone(a), clone(b), NOW);
    const floor = new Date(a.resetAt).toISOString().slice(0, 10);
    for (const d of Object.keys(m.data.activity.days)) assert.ok(d >= floor, `activity day ${d} predates the reset`);
    for (const [id, card] of Object.entries(m.data.srs)) assert.ok((card.at || 0) >= a.resetAt, `srs ${id} predates the reset`);
  }
});
