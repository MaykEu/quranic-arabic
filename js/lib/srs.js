// Spaced-repetition scheduler for vocabulary (Leitner-style boxes with
// expanding intervals — the spacing effect: Cepeda et al. 2006; 1/3/7/14/30 days).
import { get, set } from './store.js';

const KEY = 'srs';
const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30]; // days per box number (box N → INTERVALS[N-1])

export function load() {
  return get(KEY, {});
}

// Grade one card. `good` advances a box; a miss drops back to box 0 (due now).
export function review(id, good, now = Date.now()) {
  const all = load();
  const e = all[id] || { box: 0, seen: 0, right: 0, due: 0 };
  e.seen += 1;
  if (good) {
    e.right += 1;
    e.box = Math.min(e.box + 1, INTERVALS.length);
  } else {
    e.box = 0;
  }
  e.due = now + (e.box > 0 ? INTERVALS[e.box - 1] : 0) * DAY;
  e.at = now;
  all[id] = e;
  set(KEY, all);
  return e;
}

export function dueIds(all = load(), now = Date.now()) {
  return Object.keys(all).filter((id) => all[id].due <= now);
}

export function stats(all = load()) {
  let learning = 0;
  let known = 0;
  for (const id of Object.keys(all)) {
    if (all[id].box >= 3) known += 1;
    else learning += 1;
  }
  return { seen: Object.keys(all).length, learning, known };
}
