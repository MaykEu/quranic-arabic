// Progress tracking (letters / words / verses + active days). Stored in localStorage.
import { get, set } from './store.js';

const KEY = 'progress';
const EMPTY = () => ({ letters: {}, words: {}, verses: {}, days: [] });

const load = () => {
  const p = get(KEY, null);
  return p && p.letters ? p : EMPTY();
};

const save = (p) => set(KEY, p);

const today = () => new Date().toISOString().slice(0, 10);

export function mark(kind, id) {
  const p = load();
  p[kind][id] = { at: Date.now() };
  if (!p.days.includes(today())) p.days.push(today());
  save(p);
}

export function unmark(kind, id) {
  const p = load();
  delete p[kind][id];
  save(p);
}

export function isLearned(kind, id) {
  return !!load()[kind][id];
}

export function count(kind) {
  return Object.keys(load()[kind]).length;
}

export function activeDays() {
  return load().days;
}

export function resetAll() {
  save(EMPTY());
}
