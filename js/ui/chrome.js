// Shared UI chrome: sticky header (brand + theme toggle + account), bottom
// navigation, player bar mount, service-worker registration, and cloud-sync
// bootstrap. Included by every page as a module side-effect (no exports needed).
import { get, set } from '../lib/store.js';
import { mountPlayer } from './player.js';
import { captureSession, signedIn, session, signIn, signOut, syncNow } from '../lib/sync.js';
import { migrate as migrateActivity, touch as touchDay, day as activityDay, repsOf as activityReps } from '../lib/activity.js';
import { count as progressCount } from '../lib/progress.js';

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
  practice: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.7"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 13A8.5 8.5 0 1 1 11 3a6.5 6.5 0 0 0 10 10z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5"/></svg>',
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

// ---------- account (header, top-right) ----------

let refreshAccountUI = () => {};

const initials = (email) => String(email || '?').trim().charAt(0).toUpperCase();

// green = synced in the last 10 minutes; amber = signed in but stale/no sync yet
function syncDot() {
  if (!signedIn()) return 'none';
  const t = get('sync.lastSync', null);
  return t && Date.now() - t < 10 * 60000 ? 'green' : 'amber';
}

function whenText() {
  const t = get('sync.lastSync', null);
  if (!t) return 'Not synced yet';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'Synced just now';
  if (m < 60) return `Synced ${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `Synced ${h} h ago` : `Synced ${Math.round(h / 24)} d ago`;
}

function buildAccount() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const wrap = document.createElement('div');
  wrap.className = 'header-account';
  wrap.innerHTML = `
    <button type="button" class="btn-icon account-btn" id="account-btn" aria-haspopup="true" aria-expanded="false"></button>
    <div class="account-panel" id="account-panel" hidden></div>`;
  header.appendChild(wrap);

  const btn = wrap.querySelector('#account-btn');
  const panel = wrap.querySelector('#account-panel');

  const close = () => {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  const renderButton = () => {
    const s = session();
    if (!s) {
      btn.innerHTML = ICONS.account;
      btn.setAttribute('aria-label', 'Sign in');
      btn.classList.remove('has-avatar');
      return;
    }
    const dot = syncDot();
    btn.innerHTML = `<span class="avatar">${initials(s.user && s.user.email)}</span>${
      dot === 'none' ? '' : `<span class="account-dot dot-${dot}"></span>`
    }`;
    btn.setAttribute('aria-label', 'Account and sync');
    btn.classList.add('has-avatar');
  };

  // Relative day for the backup hint ("today" / "yesterday" / "N days ago").
  const relDay = (t) => {
    const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((midnight(new Date()) - midnight(new Date(t))) / 86400000);
    return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff} days ago`;
  };

  // The menu rows every account menu carries — real destinations with a live
  // hint line each (the app works fully signed out, so they show in both states).
  const menuRows = () => {
    const reps = activityReps(activityDay());
    const goal = Number(get('prefs', {}).dailyGoalReps) || 30;
    const memo = progressCount('memorised');
    const surahs = progressCount('surahs');
    const memoBits = [
      memo ? `${memo} verse${memo === 1 ? '' : 's'}` : '',
      surahs ? `${surahs} surah${surahs === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    const bak = get('lastBackupAt', null);
    return `<nav class="acc-menu" aria-label="Account pages">
      <a class="acc-row" href="progress.html">
        <span class="acc-row-title">Progress</span>
        <span class="acc-row-hint">${reps}/${goal} reps today</span>
      </a>
      <a class="acc-row" href="progress.html#memorised">
        <span class="acc-row-title">Memorised</span>
        <span class="acc-row-hint">${memoBits.length ? memoBits.join(' · ') : 'nothing marked yet'}</span>
      </a>
      <a class="acc-row" href="progress.html#data">
        <span class="acc-row-title">Backup &amp; data</span>
        <span class="acc-row-hint">${bak ? `last backup ${relDay(bak)}` : 'no backup yet'}</span>
      </a>
    </nav>`;
  };

  const renderPanel = () => {
    const s = session();
    if (!s) {
      panel.innerHTML = `
        <strong>Cloud sync</strong>
        <p class="muted">Optional — keep one progress across your phone and computer. Everything
        stays on this device until you sign in; signing in only merges your progress with your own account.</p>
        <div class="row"><button type="button" class="btn" id="acc-signin">Continue with Google</button></div>
        <div class="acc-sep"></div>
        ${menuRows()}`;
      panel.querySelector('#acc-signin').addEventListener('click', () => signIn());
      return;
    }
    const dot = syncDot();
    panel.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <strong class="acc-email">${(s.user && s.user.email) || 'Signed in'}</strong>
        <span class="account-dot dot-${dot}"></span>
      </div>
      <p class="muted" id="acc-when">${whenText()}</p>
      <div class="acc-sep"></div>
      ${menuRows()}
      <div class="acc-sep"></div>
      <button type="button" class="btn btn-ghost acc-signout" id="acc-out">Sign out</button>`;
    panel.querySelector('#acc-out').addEventListener('click', () => {
      signOut();
      renderButton();
      renderPanel();
    });
  };

  const open = () => {
    renderPanel();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const first = panel.querySelector('button, a');
    if (first) first.focus();
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !wrap.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  refreshAccountUI = () => {
    renderButton();
    if (!panel.hidden) renderPanel();
  };
  refreshAccountUI();
}

// ---------- boot ----------

buildHeader();
buildNav();
mountPlayer();
initTheme();
registerSW();

// Activity log: absorb the legacy listen counter once, then record that the app
// was opened today (this is what the Progress page's "days used" counts).
migrateActivity();
touchDay();

// Cloud sync (optional layer — the app works fully without it): pick up a fresh
// Google sign-in from the URL, then reconcile in the background on load, when the
// tab becomes visible again, and when the network comes back.
captureSession();
buildAccount();
if (signedIn()) {
  const kick = () => syncNow().catch(() => {});
  kick();
  document.addEventListener('visibilitychange', () => kick()); // flush when leaving, catch up when returning
  window.addEventListener('online', kick);
  setInterval(kick, 5 * 60 * 1000); // and every few minutes while the app stays open
}
document.addEventListener('qa:sync', () => refreshAccountUI());
