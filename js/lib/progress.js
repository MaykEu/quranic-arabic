// Progress tracking (letters / words / verses / memorised verses + active days).
// Stored in localStorage. Buckets are created lazily so older stored objects
// (from before a bucket existed) keep working — no crashes on new features.
import { get, set } from './store.js';

const KEY = 'progress';
const KINDS = ['letters', 'words', 'verses', 'memorised'];
const EMPTY = () => ({ letters: {}, words: {}, verses: {}, memorised: {}, days: [] });

const load = () => {
  const p = get(KEY, null);
  const out = p && p.letters ? p : EMPTY();
  for (const k of KINDS) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!Array.isArray(out.days)) out.days = [];
  return out;
};

const save = (p) => set(KEY, p);

const today = () => new Date().toISOString().slice(0, 10);

export function mark(kind, id) {
  const p = load();
  if (!p[kind]) p[kind] = {};
  p[kind][id] = { at: Date.now() };
  if (!p.days.includes(today())) p.days.push(today());
  save(p);
}

export function unmark(kind, id) {
  const p = load();
  if (p[kind]) delete p[kind][id];
  save(p);
  // Record a tombstone so sync doesn't resurrect the entry from another device
  // (a later re-mark with a newer `at` still wins over this tombstone).
  const t = get('tomb', {});
  t[`${kind}:${id}`] = Date.now();
  set('tomb', t);
}

export function isLearned(kind, id) {
  const p = load();
  return !!(p[kind] && p[kind][id]);
}

export function count(kind) {
  const p = load();
  return p[kind] ? Object.keys(p[kind]).length : 0;
}

export function activeDays() {
  return load().days;
}

export function resetAll() {
  save(EMPTY());
  set('tomb', {});
  // A reset is a deliberate wipe: stamp it so cloud sync drops (on both sides)
  // anything older than this moment instead of merging it back.
  set('sync.resetAt', Date.now());
}
