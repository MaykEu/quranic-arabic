// Small fetch-and-cache helper for the JSON data files in /data.
// Tries page-relative first (works for root pages and under a repo subpath on
// GitHub Pages), then one level up (so pages served from /tests/ also work).
const cache = new Map();

export async function loadData(name) {
  if (cache.has(name)) return cache.get(name);
  for (const base of ['data/', '../data/']) {
    try {
      const res = await fetch(`${base}${name}`);
      if (res.ok) {
        const json = await res.json();
        cache.set(name, json);
        return json;
      }
    } catch {
      /* try the next base */
    }
  }
  throw new Error(`Failed to load data/${name}`);
}
