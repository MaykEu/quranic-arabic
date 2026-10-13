// localStorage JSON wrapper. All keys live under the `qa.v1.` namespace.
// Writes record a per-key change stamp in `_meta` (used by cloud sync's
// last-write-wins) and dispatch a `qa:store` event (sync listens to it).
const NS = 'qa.v1.';

// Keys that must not get a change stamp: _meta itself, and device/session keys.
const UNSTAMPED = (key) => key === '_meta' || key.startsWith('sync.');

export const get = (key, fallback) => {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const set = (key, value) => {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    if (!UNSTAMPED(key)) stamp(key);
    if (typeof document !== 'undefined' && !key.startsWith('sync.')) {
      document.dispatchEvent(new CustomEvent('qa:store', { detail: { key } }));
    }
    return true;
  } catch {
    return false; // storage full / blocked — callers can ignore
  }
};

// Per-key change stamp (cloud sync uses these for last-write-wins).
const stamp = (key) => {
  try {
    const raw = localStorage.getItem(NS + '_meta');
    const m = raw ? JSON.parse(raw) : {};
    m[key] = Date.now();
    localStorage.setItem(NS + '_meta', JSON.stringify(m));
  } catch {
    /* ignore */
  }
};

export const remove = (key) => {
  localStorage.removeItem(NS + key);
};

// Wipe user data. Keeps `sync.*` keys, so a reset or backup import never signs
// the user out.
export const clearAll = () => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS) && !k.slice(NS.length).startsWith('sync.')) localStorage.removeItem(k);
  }
};

// All namespace keys (without the prefix).
export const keys = () => {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
    }
  } catch {
    /* storage unavailable */
  }
  return out;
};
