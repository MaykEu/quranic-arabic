// Small fetch-and-cache helper for the JSON data files in /data.
const cache = new Map();

export async function loadData(name) {
  if (cache.has(name)) return cache.get(name);
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(`Failed to load data/${name} (HTTP ${res.status})`);
  const json = await res.json();
  cache.set(name, json);
  return json;
}
