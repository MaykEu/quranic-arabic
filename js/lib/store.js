// localStorage JSON wrapper. All keys live under the `qa.v1.` namespace (no login — progress stays on device).
const NS = 'qa.v1.';

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
    return true;
  } catch {
    return false; // storage full / blocked — callers can ignore
  }
};

export const remove = (key) => {
  localStorage.removeItem(NS + key);
};

export const clearAll = () => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) localStorage.removeItem(k);
  }
};
