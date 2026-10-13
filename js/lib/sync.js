// Optional cloud sync (Supabase) — the app stays LOCAL-FIRST: this module
// merges this device's progress with the signed-in account's stored copy and
// pushes the result back. Nothing here is ever required to learn.
//
// Doc shape:  { v, updatedAt, resetAt?, data:{...}, tombstones:{'kind:id': ms} }
// Merge rules live in docs/sync.md — keep them and this file in step.
//
// Network: plain fetch against Supabase's REST API — no SDK, keeping the
// zero-dependency rule. Only the publishable/anon key ships in the app
// (safe by design: Row-Level Security limits every user to their own row).
import { get, set, remove, keys } from './store.js';
import { SYNC, configured } from './sync-config.js';

// Re-exported so pages can ask "is sync set up?" from the single sync module.
export { configured };

const BUCKETS = ['letters', 'words', 'verses', 'memorised', 'surahs'];
// Device-local keys that never sync:
//   theme        — presentation, each device chooses its own
//   lastBackupAt — local bookkeeping
//   tomb         — carried in doc.tombstones instead
const SKIP = new Set(['theme', 'lastBackupAt', 'tomb']);
const isSyncKey = (k) => k.startsWith('sync.');

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Normalise a doc to a known shape WITHOUT mutating the caller's object
// (mergeDocs must be safe to call with the same document twice).
const norm = (doc) => {
  const src = doc && typeof doc === 'object' ? doc : {};
  return {
    ...src,
    data: src.data && typeof src.data === 'object' ? src.data : {},
    tombstones: src.tombstones && typeof src.tombstones === 'object' ? src.tombstones : {},
    updatedAt: Number(src.updatedAt) || 0,
    resetAt: Number(src.resetAt) || 0,
  };
};

// ---------- collect / apply ----------

export function collectDoc(now = Date.now()) {
  const data = {};
  for (const k of keys()) {
    if (isSyncKey(k) || SKIP.has(k)) continue;
    data[k] = get(k, null);
  }
  return {
    v: 1,
    updatedAt: now,
    resetAt: get('sync.resetAt', 0) || 0,
    data,
    tombstones: get('tomb', {}) || {},
  };
}

let applying = false;
export const isApplying = () => applying;

export function applyDoc(doc) {
  const d = norm(doc);
  applying = true;
  try {
    for (const [k, v] of Object.entries(d.data)) {
      if (isSyncKey(k) || SKIP.has(k)) continue;
      set(k, v);
    }
    set('tomb', d.tombstones);
    if (d.resetAt) set('sync.resetAt', d.resetAt);
  } finally {
    applying = false;
  }
}

// ---------- merge ----------

export function mergeProgress(p, q, resetAt = 0) {
  p = p && typeof p === 'object' ? p : {};
  q = q && typeof q === 'object' ? q : {};
  const out = {};
  for (const bucket of BUCKETS) {
    const m = {};
    for (const src of [p[bucket], q[bucket]]) {
      if (!src || typeof src !== 'object') continue;
      for (const [id, e] of Object.entries(src)) {
        if (!e || typeof e !== 'object' || typeof e.at !== 'number') continue;
        if (e.at < resetAt) continue;
        if (!m[id] || e.at < m[id].at) m[id] = { ...e }; // earliest learning date
      }
    }
    out[bucket] = m;
  }
  const days = new Set();
  const floor = resetAt ? isoDay(resetAt) : '';
  for (const src of [p.days, q.days]) {
    if (!Array.isArray(src)) continue;
    for (const d of src) if (typeof d === 'string' && (!floor || d >= floor)) days.add(d);
  }
  out.days = [...days].sort();
  return out;
}

// Most recent review wins; exact tie → higher box (never lose progress).
export function mergeSrs(a, b, resetAt = 0) {
  a = a && typeof a === 'object' ? a : {};
  b = b && typeof b === 'object' ? b : {};
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id];
    const y = b[id];
    if (!x && !y) continue;
    if (!x || !y) {
      const one = x || y;
      if ((one.at || 0) >= resetAt) out[id] = { ...one };
      continue;
    }
    if ((x.at || 0) < resetAt && (y.at || 0) < resetAt) continue;
    const pick =
      (x.at || 0) !== (y.at || 0)
        ? (x.at || 0) > (y.at || 0)
          ? x
          : y
        : (x.box || 0) >= (y.box || 0)
          ? x
          : y;
    out[id] = { ...pick };
  }
  return out;
}

export function mergePractice(a, b, resetAt = 0) {
  a = a && typeof a === 'object' ? a : {};
  b = b && typeof b === 'object' ? b : {};
  const floor = resetAt ? isoDay(resetAt) : '';
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (floor && k < floor) continue;
    out[k] = Math.max(Number(a[k]) || 0, Number(b[k]) || 0);
  }
  return out;
}

export function mergeTombstones(a, b, resetAt = 0) {
  const out = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, at] of Object.entries(src)) {
      const t = Number(at) || 0;
      if (t < resetAt) continue;
      if (!out[k] || t > out[k]) out[k] = t;
    }
  }
  return out;
}

// A tombstone removes an entry unless the entry was (re)marked after it —
// latest action wins, on whichever device it happened.
function dropTombstoned(progress, tombstones) {
  for (const [key, at] of Object.entries(tombstones)) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const bucket = progress[kind];
    if (!bucket || !bucket[id]) continue;
    if ((bucket[id].at || 0) <= at) delete bucket[id];
  }
}

const stampOf = (key, doc) => {
  const meta = doc.data._meta;
  return meta && typeof meta === 'object' ? Number(meta[key]) || 0 : 0;
};

export function mergeDocs(docA, docB, now = Date.now()) {
  const a = norm(docA);
  const b = norm(docB);
  const resetAt = Math.max(a.resetAt, b.resetAt);

  const data = {};
  // _meta: newest stamp per key
  const meta = {};
  for (const src of [a.data._meta, b.data._meta]) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, t] of Object.entries(src)) if (!meta[k] || t > meta[k]) meta[k] = t;
  }
  data._meta = meta;

  const progress = mergeProgress(a.data.progress, b.data.progress, resetAt);
  const tombstones = mergeTombstones(a.tombstones, b.tombstones, resetAt);
  dropTombstoned(progress, tombstones);
  data.progress = progress;
  data.srs = mergeSrs(a.data.srs, b.data.srs, resetAt);
  data.practice = mergePractice(a.data.practice, b.data.practice, resetAt);

  // Everything else: newest write wins (change stamps; lastRead can use its own at).
  const special = new Set(['_meta', 'progress', 'srs', 'practice']);
  for (const k of new Set([...Object.keys(a.data), ...Object.keys(b.data)])) {
    if (special.has(k)) continue;
    const inA = k in a.data;
    const inB = k in b.data;
    if (inA && inB) {
      const sa = stampOf(k, a) || (k === 'lastRead' && a.data[k] ? a.data[k].at || 0 : 0) || a.updatedAt;
      const sb = stampOf(k, b) || (k === 'lastRead' && b.data[k] ? b.data[k].at || 0 : 0) || b.updatedAt;
      data[k] = sb > sa ? b.data[k] : a.data[k];
    } else {
      data[k] = inA ? a.data[k] : b.data[k];
    }
  }

  return { v: 1, updatedAt: now, resetAt: resetAt || undefined, data, tombstones };
}

// ---------- session ----------

const API = () => SYNC.url.replace(/\/+$/, '');
export const session = () => get('sync.session', null);
export const signedIn = () => !!session();

const jwtPayload = (token) => {
  try {
    const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
};

// Call on page load: picks up the tokens Supabase appends to the URL after
// the Google redirect, stores them, and cleans the address bar.
export function captureSession(url = typeof location !== 'undefined' ? location.href : '') {
  const h = String(url).split('#')[1] || '';
  if (!h.includes('access_token=')) return null;
  const p = new URLSearchParams(h);
  const token = p.get('access_token');
  if (!token) return null;
  const payload = jwtPayload(token);
  const s = {
    access_token: token,
    refresh_token: p.get('refresh_token') || null,
    expires_at: Date.now() + (Number(p.get('expires_in') || 3600) - 120) * 1000,
    user: { id: payload.sub || null, email: payload.email || null },
  };
  set('sync.session', s);
  if (typeof history !== 'undefined' && typeof location !== 'undefined' && location.hash.includes('access_token=')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  return s;
}

async function refreshSession(s) {
  const res = await fetch(`${API()}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SYNC.key },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const payload = jwtPayload(j.access_token);
  const next = {
    ...s,
    access_token: j.access_token,
    refresh_token: j.refresh_token || s.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in || 3600) - 120) * 1000,
    user: { id: payload.sub || (s.user && s.user.id), email: payload.email || (s.user && s.user.email) },
  };
  set('sync.session', next);
  return next;
}

async function freshSession() {
  let s = session();
  if (!s) return null;
  if (Date.now() > s.expires_at) s = await refreshSession(s);
  return s;
}

export function authorizeUrl(redirect) {
  const to = redirect || (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  const u = new URL(`${API()}/auth/v1/authorize`);
  u.searchParams.set('provider', 'google');
  u.searchParams.set('redirect_to', to);
  return u.toString();
}

export function signIn(redirect) {
  const url = authorizeUrl(redirect);
  if (typeof location !== 'undefined') location.href = url;
  return url;
}

export function signOut() {
  remove('sync.session');
  remove('sync.lastSync');
}

// ---------- REST ----------

const jsonHeaders = (s) => ({
  apikey: SYNC.key,
  Authorization: `Bearer ${s.access_token}`,
  'Content-Type': 'application/json',
});

async function fetchRemote(s) {
  const url = `${API()}/rest/v1/progress?select=doc&user_id=eq.${encodeURIComponent(s.user.id)}`;
  const res = await fetch(url, { headers: jsonHeaders(s) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const rows = await res.json();
  return (Array.isArray(rows) && rows[0] && rows[0].doc) || null;
}

async function pushRemote(s, doc) {
  const res = await fetch(`${API()}/rest/v1/progress?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...jsonHeaders(s), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ user_id: s.user.id, doc, updated_at: new Date(doc.updatedAt).toISOString() }]),
  });
  if (!res.ok) throw new Error(`push ${res.status}`);
}

export async function syncNow() {
  if (!configured()) return { ok: false, reason: 'not-configured' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  let s;
  try {
    s = await freshSession();
  } catch {
    return { ok: false, reason: 'auth' };
  }
  if (!s || !s.user || !s.user.id) return { ok: false, reason: 'signed-out' };
  try {
    const remote = await fetchRemote(s);
    const local = collectDoc();
    const merged = remote ? mergeDocs(local, remote) : local;
    applyDoc(merged);
    await pushRemote(s, merged);
    set('sync.lastSync', Date.now());
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('qa:sync', { detail: { ok: true } }));
    }
    return { ok: true, hadRemote: !!remote, keys: Object.keys(merged.data).length };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

// Debounced auto-sync: every local write schedules a background reconcile.
let timer = 0;
export function queueSync(delay = 4000) {
  if (!configured() || !signedIn() || isApplying()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncNow().catch(() => {});
  }, delay);
}

if (typeof document !== 'undefined') {
  document.addEventListener('qa:store', (e) => {
    if (isApplying()) return;
    if (e.detail && String(e.detail.key || '').startsWith('sync.')) return;
    queueSync();
  });
}
