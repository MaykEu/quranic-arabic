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

const { mergeDocs, collectDoc, applyDoc, authorizeUrl, captureSession } = await import('../js/lib/sync.js');
const { set, get } = await import('../js/lib/store.js');

const doc = (data, tombstones = {}, extra = {}) => ({ v: 1, updatedAt: 1000, data, tombstones, ...extra });
const D = (s) => Date.parse(`${s}T12:00:00Z`);
const prog = (extra = {}) => ({ letters: {}, words: {}, verses: {}, memorised: {}, days: [], ...extra });

test('merges progress buckets as a union, keeping the earliest date', () => {
  const a = doc({
    progress: prog({ letters: { alif: { at: 10 } }, memorised: { '1:1': { at: 50 } }, days: ['2026-10-01'] }),
  });
  const b = doc({
    progress: prog({
      letters: { alif: { at: 5 }, ba: { at: 7 } },
      memorised: { '1:1': { at: 40 }, '1:2': { at: 60 } },
      days: ['2026-10-02'],
    }),
  });
  const m = mergeDocs(a, b, 999);
  assert.deepEqual(Object.keys(m.data.progress.letters).sort(), ['alif', 'ba']);
  assert.equal(m.data.progress.letters.alif.at, 5);
  assert.deepEqual(Object.keys(m.data.progress.memorised).sort(), ['1:1', '1:2']);
  assert.equal(m.data.progress.memorised['1:1'].at, 40);
  assert.deepEqual(m.data.progress.days, ['2026-10-01', '2026-10-02']);
});

test('a tombstone beats an entry marked before it (un-mark survives the merge)', () => {
  const a = doc({ progress: prog({ memorised: { '2:255': { at: 10 } } }) });
  const b = doc({ progress: prog() }, { 'memorised:2:255': 20 });
  for (const m of [mergeDocs(a, b, 999), mergeDocs(b, a, 999)]) {
    assert.equal(m.data.progress.memorised['2:255'], undefined);
    assert.equal(m.tombstones['memorised:2:255'], 20);
  }
});

test('a re-mark after the tombstone wins (latest action wins)', () => {
  const a = doc({ progress: prog({ memorised: { '2:255': { at: 30 } } }) });
  const b = doc({ progress: prog() }, { 'memorised:2:255': 20 });
  for (const m of [mergeDocs(a, b, 999), mergeDocs(b, a, 999)]) {
    assert.equal(m.data.progress.memorised['2:255'].at, 30);
  }
});

test('srs: most recent review wins; exact tie goes to the higher box', () => {
  const a = doc({ srs: { '12': { box: 4, at: 100, seen: 5 } } });
  const b = doc({ srs: { '12': { box: 1, at: 200, seen: 3 } } });
  assert.equal(mergeDocs(a, b, 1).data.srs['12'].box, 1); // later review (200) wins
  const tieA = doc({ srs: { '7': { box: 1, at: 100 } } });
  const tieB = doc({ srs: { '7': { box: 3, at: 100 } } });
  assert.equal(mergeDocs(tieA, tieB, 1).data.srs['7'].box, 3);
  // cards present on one side only are kept
  const solo = mergeDocs(doc({ srs: { '1': { box: 2, at: 5 } } }), doc({ srs: {} }), 1);
  assert.equal(solo.data.srs['1'].box, 2);
});

test('practice: listen counter merges per day; selection keys are last-write-wins', () => {
  const a = doc({ practice: { listens: { '2026-10-01': 3, '2026-10-02': 1 }, recallSingle: true } });
  const b = doc({ practice: { listens: { '2026-10-01': 5 }, readVerse: { s: 2, a: 255 } } }, {}, { updatedAt: 2000 });
  const m = mergeDocs(a, b, 1);
  assert.deepEqual(m.data.practice.listens, { '2026-10-01': 5, '2026-10-02': 1 });
  assert.ok(m.data.practice.readVerse); // newer doc supplies its selection keys
  assert.equal(m.data.practice.recallSingle, true); // one-sided keys are kept, never dropped
  const m2 = mergeDocs(b, a, 1);
  assert.deepEqual(m2.data.practice.listens, { '2026-10-01': 5, '2026-10-02': 1 });
  assert.ok(m2.data.practice.readVerse);
});

test('legacy {day,count} practice shapes are absorbed, never merged into junk (regression)', () => {
  const a = doc({ practice: { day: '2026-10-13', count: 3 } });
  const b = doc({ practice: { day: '2026-10-13', count: 3 } });
  const m = mergeDocs(a, b, 1);
  assert.equal(m.data.practice.day, undefined);
  assert.equal(m.data.practice.count, undefined);
  assert.equal(m.data.practice.listens['2026-10-13'], 3); // the counter survives the merge
});

test('practice counts merge per day (max), days union', () => {
  const a = doc({ progress: prog({ days: ['2026-10-01'] }) });
  const b = doc({ progress: prog({ days: ['2026-10-03'] }) });
  const m = mergeDocs(a, b, 1);
  assert.deepEqual(m.data.progress.days, ['2026-10-01', '2026-10-03']);
});

test('a reset on one device drops what is older than it, keeps what is newer', () => {
  const resetAt = D('2026-10-10');
  const a = doc(
    {
      progress: prog({ letters: { newOne: { at: D('2026-10-11') } }, days: ['2026-10-01', '2026-10-11'] }),
      practice: { listens: { '2026-10-01': 9, '2026-10-11': 2 } },
      srs: { '1': { box: 3, at: D('2026-10-01') }, '2': { box: 1, at: D('2026-10-11') } },
    },
    { 'letters:gone': D('2026-10-02') },
    { resetAt },
  );
  const m = mergeDocs(a, doc({}), 1); // the other device has nothing (wiped)
  assert.equal(m.data.progress.letters.newOne.at, D('2026-10-11'));
  assert.deepEqual(m.data.progress.days, ['2026-10-11']);
  assert.deepEqual(m.data.practice.listens, { '2026-10-11': 2 });
  assert.equal(m.data.srs['1'], undefined);
  assert.equal(m.data.srs['2'].box, 1);
  assert.deepEqual(m.tombstones, {});
  assert.equal(m.resetAt, resetAt);
});

test('plain keys: newest write wins via _meta stamps, doc date as fallback', () => {
  const a = doc({ brush: 8, _meta: { brush: 100 } });
  const b = doc({ brush: 5, _meta: { brush: 300 } });
  assert.equal(mergeDocs(a, b, 1).data.brush, 5);
  assert.equal(mergeDocs(b, a, 1).data.brush, 5);
  const old = doc({ prefs: { tr: 'pickthall' } }, {}, { updatedAt: 10 });
  const fresh = doc({ prefs: { tr: 'sahih' } }, {}, { updatedAt: 99 });
  assert.equal(mergeDocs(old, fresh, 1).data.prefs.tr, 'sahih');
});

test('merge is symmetric and idempotent', () => {
  const a = doc(
    {
      progress: prog({ memorised: { '1:1': { at: 10 } }, days: ['2026-10-01'] }),
      srs: { '3': { box: 2, at: 50 } },
      practice: { '2026-10-01': 2 },
      brush: 5,
      _meta: { brush: 20 },
    },
    { 'verses:9:9': 30 },
  );
  const b = doc(
    {
      progress: prog({ memorised: { '1:2': { at: 12 } }, days: ['2026-10-02'] }),
      srs: { '3': { box: 1, at: 40 } },
      brush: 9,
      _meta: { brush: 10 },
    },
    { 'letters:alif': 15 },
  );
  const m1 = mergeDocs(a, b, 777);
  const m2 = mergeDocs(b, a, 777);
  assert.deepEqual(m1, m2);
  assert.deepEqual(mergeDocs(m1, m1, 777), m1);
});

test('collectDoc excludes device-local keys and the sync session; applyDoc preserves them', () => {
  mem.clear();
  const R = Date.now() - 3600000; // a reset an hour ago
  const T = Date.now(); // activity after it
  set('prefs', { tr: 'sahih' });
  set('srs', { '1': { box: 2, at: T } });
  set('tomb', { 'memorised:1:1': T });
  set('theme', 'dark');
  set('lastBackupAt', 123);
  set('sync.resetAt', R);
  set('sync.session', { access_token: 'SECRET', refresh_token: 'R' });
  set('sync.lastSync', 55);

  const c = collectDoc(1000);
  assert.equal(c.data.prefs.tr, 'sahih');
  assert.equal(c.data.theme, undefined);
  assert.equal(c.data.lastBackupAt, undefined);
  assert.equal(c.data['sync.session'], undefined);
  assert.equal(c.data.tomb, undefined);
  assert.deepEqual(c.tombstones, { 'memorised:1:1': T });
  assert.equal(c.resetAt, R);

  const merged = mergeDocs(c, doc({ srs: { '2': { box: 1, at: T } } }), 2000);
  applyDoc(merged);
  assert.equal(get('sync.session').access_token, 'SECRET'); // session never touched
  assert.ok(get('srs')['1'] && get('srs')['2']);
  assert.equal(get('tomb')['memorised:1:1'], T);
  assert.equal(get('sync.resetAt'), R);
});

test('fresh device + existing account = the account data', () => {
  const account = doc({
    progress: prog({ memorised: { '112:1': { at: 10 } }, days: ['2026-10-05'] }),
    srs: { '5': { box: 3, at: 20 } },
    prefs: { tr: 'sahih' },
  });
  const m = mergeDocs(doc({}), account, 1);
  assert.equal(m.data.progress.memorised['112:1'].at, 10);
  assert.equal(m.data.srs['5'].box, 3);
  assert.equal(m.data.prefs.tr, 'sahih');
});

test('authorizeUrl points at the project’s Google endpoint with the right scopes', () => {
  const url = authorizeUrl('https://maykeu.github.io/quranic-arabic/');
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://wcleejkpavmydokphavh.supabase.co/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), 'https://maykeu.github.io/quranic-arabic/');
});

test('captureSession reads the tokens the OAuth redirect appends', () => {
  mem.clear();
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', email: 'a@b.c' })).toString('base64url');
  const token = `aa.${payload}.cc`;
  const s = captureSession(`https://example.com/#access_token=${token}&refresh_token=rr&expires_in=3600`);
  assert.equal(s.user.id, 'user-1');
  assert.equal(s.user.email, 'a@b.c');
  assert.equal(get('sync.session').access_token, token);
  assert.equal(get('sync.session').refresh_token, 'rr');
  assert.equal(captureSession('https://example.com/#unrelated=1'), null); // no tokens, no session
});

test('surah marks merge like any other bucket (union + tombstone)', () => {
  const a = doc({ progress: prog({ surahs: { 112: { at: 10 } } }) });
  const b = doc({ progress: prog({ surahs: { 1: { at: 12 } } }) }, { 'surahs:9': 20 });
  const m = mergeDocs(a, b, 9);
  assert.deepEqual(Object.keys(m.data.progress.surahs).sort(), ['1', '112']);

  const c = doc({ progress: prog({ surahs: { 9: { at: 5 } } }) });
  const m2 = mergeDocs(c, b, 9);
  assert.equal(m2.data.progress.surahs['9'], undefined); // tombstoned on the other device
  assert.ok(m2.data.progress.surahs['1']);
});

// The reported bug: “Erase all progress” wiped the device, but the account’s copy
// was all “newer than 0”, so the next automatic sync merged every letter, surah
// and review straight back in. The fix is stamping sync.resetAt on the reset —
// this test fails if that stamp is ever dropped again.
test('resetAll erases this device AND the account copy (the reset stamp is the fix)', async () => {
  const { resetAll } = await import('../js/lib/progress.js');
  const { clearAll } = await import('../js/lib/store.js');
  const T1 = D('2026-10-01');

  // This device has progress, and the account holds the same copy.
  set('progress', prog({ letters: { ba: { at: T1 } }, surahs: { 1: { at: T1 } }, memorised: { '1:1': { at: T1 } } }));
  set('srs', { '7': { box: 3, seen: 2, right: 2, at: T1 } });
  set('activity', { days: { '2026-10-01': { reviews: 9 } } });
  const account = collectDoc(T1);

  // “Erase all progress”
  resetAll();
  clearAll();
  const local = collectDoc();
  assert.ok(local.resetAt > T1, 'the reset must be stamped (sync.resetAt)');
  assert.equal(Object.keys(local.data).filter((k) => k !== '_meta').length, 0, 'nothing left on the device');

  // The next automatic sync pulls the account copy and merges it back in.
  const merged = mergeDocs(local, account);
  assert.equal(Object.keys((merged.data.progress || {}).letters || {}).length, 0, 'letter marks came back');
  assert.equal(Object.keys((merged.data.progress || {}).surahs || {}).length, 0, 'memorised surahs came back');
  assert.equal(Object.keys(merged.data.srs || {}).length, 0, 'SRS cards came back');
  assert.equal(merged.resetAt, local.resetAt);

  // …and that merged doc is what gets pushed, so the other devices drop it too.
  applyDoc(merged);
  assert.equal(Object.keys((get('progress') || {}).letters || {}).length, 0);
  assert.equal(get('sync.resetAt'), local.resetAt);
});
