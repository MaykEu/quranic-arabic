// Activity log — one small record per day for the Progress page: what was done
// (reps, drills, seconds listened/read). Deliberately NOT per-item and NOT a
// streak: it exists so the stats can be honest and the daily goal can say "done".
// Keys are LOCAL days; cloud sync merges per-day, per-field MAX so two devices
// can never double-count the same day.
import { get, set } from './store.js';

const KEY = 'activity';
const DAY_MS = 86400000;

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const keyToDate = (k) => {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export function load() {
  const a = get(KEY, null);
  const out = a && typeof a === 'object' ? a : {};
  if (!out.days || typeof out.days !== 'object') out.days = {};
  if (!out.best || typeof out.best !== 'object') out.best = {};
  return out;
}

const save = (a) => set(KEY, a);

export const day = (k = dayKey()) => load().days[k] || {};

// Per-day counter (+n).
export function bump(field, n = 1, k = dayKey()) {
  if (!n) return day(k);
  const a = load();
  const d = (a.days[k] = a.days[k] || {});
  d[field] = Math.round((d[field] || 0) + n);
  save(a);
  return d;
}

// One graded interaction: bump the counter and, when it went well, its `Ok` twin.
export function graded(field, ok, k = dayKey()) {
  bump(field, 1, k);
  if (ok) bump(field + 'Ok', 1, k);
}

// All-time best for a named record (e.g. a quiz round score). Max, never sums.
export function setBest(key, value) {
  const a = load();
  const cur = a.best[key] || 0;
  if (!(value > cur)) return cur;
  a.best[key] = value;
  save(a);
  return value;
}

export const best = (key) => load().best[key] || 0;

// The app was opened today.
export function touch() {
  return bump('visits');
}

// ---- derived ---------------------------------------------------------------

// Counter fields with an `Ok` twin (they count as graded answers).
const GRADED = [
  ['reviews', 'reviewsOk'],
  ['quizRead', 'quizReadOk'],
  ['quizMeaning', 'quizMeaningOk'],
  ['traces', 'tracesOk'],
  ['recalls', 'recallsOk'],
  ['letters', 'lettersOk'],
  ['vowels', 'vowelsOk'],
];
// Everything that counts as one "rep" towards the daily goal.
export const REP_FIELDS = GRADED.map(([a]) => a).concat(['listens']);

export const repsOf = (d = {}) => REP_FIELDS.reduce((n, f) => n + (d[f] || 0), 0);

// The last N days (oldest → newest) with their day records.
export function range(days, end = new Date(), doc = load()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(end.getTime() - i * DAY_MS));
    out.push({ key: k, d: doc.days[k] || {} });
  }
  return out;
}

export function totals(list) {
  const t = {};
  for (const { d } of list) for (const [f, v] of Object.entries(d)) t[f] = (t[f] || 0) + v;
  return t;
}

// Accuracy over a window: every graded answer, plus the per-drill splits.
export function accuracy(t) {
  let n = 0;
  let ok = 0;
  const per = {};
  for (const [a, b] of GRADED) {
    const na = t[a] || 0;
    const nb = t[b] || 0;
    n += na;
    ok += nb;
    per[a] = { n: na, ok: nb, pct: na ? Math.round((nb / na) * 100) : null };
  }
  return { n, ok, pct: n ? Math.round((ok / n) * 100) : null, per };
}

export const daysUsed = (doc = load()) => Object.keys(doc.days).length;

// ---- listening seconds -----------------------------------------------------

// Count the seconds an audio element ACTUALLY played: forward playback only, so
// seeks, stalls and replays-after-seek don't inflate the number. Flushes to the
// day log every ~15 s of playback and on pause/end.
export function trackAudio(el) {
  if (!el || el.__qaTracked) return el;
  el.__qaTracked = true;
  let last = null;
  let acc = 0;
  const flush = () => {
    const whole = Math.floor(acc);
    if (whole >= 5) {
      acc -= whole;
      bump('listenSec', whole);
    }
  };
  el.addEventListener('playing', () => {
    last = el.currentTime;
  });
  el.addEventListener('timeupdate', () => {
    const t = el.currentTime;
    if (last != null && t > last && t - last < 3) acc += t - last;
    last = t;
    if (acc >= 15) flush();
  });
  el.addEventListener('pause', () => {
    flush();
    last = el.currentTime;
  });
  el.addEventListener('ended', () => {
    flush();
    last = null;
  });
  return el;
}

// ---- legacy + merge --------------------------------------------------------

// Absorb the old practice.listens map (pre-qa-v32 the Listen counter lived
// there) into the day log, once. Existing activity values always win.
export function migrate() {
  const a = load();
  if (a.seeded) return false;
  const legacy = (get('practice', {}) || {}).listens || {};
  for (const [k, n] of Object.entries(legacy)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const d = (a.days[k] = a.days[k] || {});
    if (!d.listens) d.listens = Number(n) || 0;
  }
  a.seeded = true;
  save(a);
  return true;
}

// Cloud-sync merge: union of days (older than a deliberate reset are dropped),
// per-day per-field MAX, best = max. Symmetric by construction.
export function mergeActivity(one, two, resetAt = 0) {
  const norm = (x) => {
    const o = x && typeof x === 'object' ? x : {};
    return {
      days: o.days && typeof o.days === 'object' ? o.days : {},
      best: o.best && typeof o.best === 'object' ? o.best : {},
    };
  };
  const A = norm(one);
  const B = norm(two);
  // A reset is a local moment: drop everything before the LOCAL day it happened.
  const floor = resetAt ? dayKey(new Date(resetAt)) : '';
  const days = {};
  for (const k of new Set([...Object.keys(A.days), ...Object.keys(B.days)])) {
    if (floor && k < floor) continue;
    const da = A.days[k] || {};
    const db = B.days[k] || {};
    const d = {};
    for (const f of new Set([...Object.keys(da), ...Object.keys(db)])) d[f] = Math.max(da[f] || 0, db[f] || 0);
    days[k] = d;
  }
  const bs = {};
  for (const k of new Set([...Object.keys(A.best), ...Object.keys(B.best)])) bs[k] = Math.max(A.best[k] || 0, B.best[k] || 0);
  return { days, best: bs, seeded: true };
}
