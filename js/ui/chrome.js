// Shared UI chrome: sticky header (brand + theme toggle), bottom navigation,
// player bar mount, and service-worker registration.
// Included by every page as a module side-effect (no exports needed).
import { get, set } from '../lib/store.js';
import { mountPlayer } from './player.js';

const NAV = [
  ['index.html', 'Home', 'home'],
  ['letters.html', 'Letters', 'letters'],
  ['words.html', 'Words', 'words'],
  ['verses.html', 'Verses', 'verses'],
  ['practice.html', 'Practice', 'practice'],
];

const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  letters: '<svg viewBox="0 0 24 24"><path d="M12 6C10 4.5 7.5 4 4 4v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z"/><path d="M12 6v14"/></svg>',
  words: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>',
  verses: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  practice: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 13A8.5 8.5 0 1 1 11 3a6.5 6.5 0 0 0 10 10z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
};

function buildHeader() {
  const h = document.createElement('header');
  h.className = 'site-header';
  h.innerHTML = `<h1 class="site-title">Quranic Arabic <span class="ar" lang="ar" dir="rtl">القرآن</span></h1>
    <div class="header-spacer"></div>
    <button class="btn-icon" id="theme-toggle" aria-label="Toggle light / dark mode"></button>`;
  document.body.prepend(h);
}

function buildNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Main navigation');
  for (const [href, label, icon] of NAV) {
    const a = document.createElement('a');
    a.className = 'nav-item';
    a.href = href;
    a.innerHTML = ICONS[icon] + `<span>${label}</span>`;
    if (href === current) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  document.body.appendChild(nav);
}

function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;
}

function initTheme() {
  applyTheme(get('theme', null));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    set('theme', next);
    applyTheme(next);
  });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  // Local development: keep reloads fresh — remove any old worker and skip
  // registration entirely on localhost (the deployed site still caches offline).
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  if (hadController) {
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      location.reload();
    });
  }
}

buildHeader();
buildNav();
mountPlayer();
initTheme();
registerSW();
