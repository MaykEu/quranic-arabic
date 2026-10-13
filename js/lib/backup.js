// Progress backup: export everything the app stores (the whole qa.v1.
// namespace) to a JSON file, and restore it on any device.
// Format: { app, format, exported, data: { <key without namespace>: value } }
import { clearAll } from './store.js';

const NS = 'qa.v1.';
export const BACKUP_APP = 'quranic-arabic';
export const BACKUP_FORMAT = 1;

export const BACKUP_FILENAME = (d = new Date()) =>
  `quranic-arabic-progress-${d.toISOString().slice(0, 10)}.json`;

// Everything currently stored under the namespace, parsed.
// One exception: the cloud-sync session (access/refresh token) is NEVER
// exported — a downloaded backup file must not contain credentials.
export function collect() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NS)) continue;
      if (k.slice(NS.length).startsWith('sync.')) continue; // session + sync bookkeeping stay on device
      try {
        data[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k));
      } catch {
        /* skip unparseable entries */
      }
    }
  } catch {
    /* storage unavailable */
  }
  return data;
}

export function exportData() {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exported: new Date().toISOString(),
    data: collect(),
  };
}

// Friendly counts for "this backup contains…" summaries.
export function summarize(data) {
  const progress = (data && data.progress) || {};
  const srs = (data && data.srs) || {};
  const ids = Object.keys(srs);
  const words = ids.filter((id) => /^\d+$/.test(id) || id.startsWith('b:')).length;
  const known = ids.filter((id) => /^\d+$/.test(id) && srs[id] && srs[id].box >= 3).length;
  return {
    letters: Object.keys(progress.letters || {}).length,
    words,
    known,
    verses: Object.keys(progress.verses || {}).length,
    reviews: ids.length,
    days: Array.isArray(progress.days) ? progress.days.length : 0,
  };
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, reason: 'That file is not a backup.' };
  }
  if (obj.app !== BACKUP_APP) {
    return { ok: false, reason: 'That file was not made by this app.' };
  }
  if (typeof obj.format !== 'number' || obj.format > BACKUP_FORMAT) {
    return { ok: false, reason: 'That backup is from a newer version — update the app first.' };
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    return { ok: false, reason: 'That backup has no data in it.' };
  }
  return { ok: true, stats: summarize(obj.data) };
}

// Replace everything in the namespace with the backup's contents.
export function applyImport(obj) {
  clearAll();
  let n = 0;
  for (const [k, v] of Object.entries(obj.data)) {
    try {
      localStorage.setItem(NS + k, JSON.stringify(v));
      n++;
    } catch {
      /* quota — skip */
    }
  }
  return n;
}

// Trigger a .json file download of the current data. Returns the exported object.
export function downloadBackup() {
  const obj = exportData();
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = BACKUP_FILENAME();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return obj;
}
