// Service worker: offline app shell + runtime caches.
// Bump VERSION whenever shipped files change (forces a clean re-cache).
const VERSION = 'qa-v31';
const AUDIO_CACHE = 'qa-audio-v2';
const AUDIO_HOSTS = ['audio.qurancdn.com', 'cdn.islamic.network', 'everyayah.com'];
const AUDIO_MAX_ENTRIES = 300;

const SHELL = [
  './',
  'index.html', 'letters.html', 'words.html', 'verses.html', 'practice.html', 'progress.html', 'about.html', 'guide.html', 'basics.html', 'roots.html',
  'css/styles.css', 'css/build.css', 'css/reading.css', 'css/path.css', 'css/basics.css',
  'js/lib/store.js', 'js/lib/audio.js', 'js/lib/srs.js', 'js/lib/progress.js', 'js/lib/hash.js', 'js/lib/data.js', 'js/lib/shaping.js', 'js/lib/backup.js', 'js/lib/quiz.js',
  'js/ui/chrome.js', 'js/ui/player.js', 'js/ui/toast.js', 'js/ui/trace.js', 'js/ui/build-game.js', 'js/ui/verse-picker.js',
  'js/pages/home.js', 'js/pages/letters.js', 'js/pages/words.js', 'js/pages/verses.js', 'js/pages/practice.js', 'js/pages/progress.js', 'js/pages/about.js', 'js/pages/guide.js', 'js/pages/basics.js', 'js/pages/roots.js',
  'manifest.json',
  'assets/fonts/amiri-arabic-400.woff2', 'assets/fonts/amiri-arabic-700.woff2',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon.ico',
  'data/letters.json', 'data/harakat.json', 'data/reciters.json', 'data/grammar-terms.json', 'data/verse-notes.json',
  'data/vocabulary.json', 'data/build-words.json', 'data/roots.json', 'data/quran/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Tolerant precache: missing files (e.g. during development) don't fail install.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== VERSION && name !== AUDIO_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// Network-first for same-origin files: online you always get the latest build
// (no stale window after a deploy); offline falls back to the last cached copy.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    return hit || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function cacheFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const hit = await cache.match(request);
  // Only trust full (200) responses. A cached 206 partial would break playback
  // (truncated audio / wrong range served for a full-file request).
  if (hit && hit.status === 200) return hit;
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      cache.put(request, res.clone());
      trimCache(cache, AUDIO_MAX_ENTRIES);
    }
    return res;
  } catch {
    return new Response('Audio not available offline yet', { status: 503, statusText: 'Offline' });
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (const key of keys.slice(0, keys.length - max)) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (AUDIO_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirstAudio(request));
    return;
  }

  if (url.origin === location.origin) {
    // Per-surah data files: cached copy is fine (they never change), avoid re-downloading.
    if (url.pathname.includes('/data/quran/')) {
      event.respondWith(staleWhileRevalidate(request, VERSION));
      return;
    }
    // Everything else (pages, styles, scripts, data): network-first, cache as offline fallback.
    event.respondWith(networkFirst(request, VERSION));
  }
});
