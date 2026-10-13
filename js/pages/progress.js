// Progress page: today's goal, the numbers that matter (including how much of
// the Qur'an you can now understand), what the drills say, the activity record,
// memorised verses, and your data — backup, import, reset.
// Everything lives on this device only (localStorage, qa.v1. namespace).
import { loadData } from '../lib/data.js';
import { load as loadSRS, dueIds } from '../lib/srs.js';
import { count as progressCount, isLearned, unmark } from '../lib/progress.js';
import { get, set, clearAll } from '../lib/store.js';
import { downloadBackup, validateImport, applyImport, summarize, collect } from '../lib/backup.js';
import { configured, signedIn, session, signIn, signOut, syncNow, captureSession } from '../lib/sync.js';
import * as activity from '../lib/activity.js';
import { toast } from '../ui/toast.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DAY_MS = 86400000;
const GOAL_DEFAULT = 30;
const GOAL_PRESETS = [15, 30, 60];

let surahNames = new Map();
let vocab = { words: [], total_tokens: 1 };
let letters = [];
let srsAll = {};

const stat = (value, label) => `<div class="stat"><b>${esc(String(value))}</b><span class="muted">${esc(label)}</span></div>`;
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtMin = (sec) => {
  const m = Math.round((sec || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const goal = () => {
  const g = Number(get('prefs', {}).dailyGoalReps);
  return g > 0 ? g : GOAL_DEFAULT;
};
const boxOf = (id) => (srsAll[id] || {}).box || 0;

function snapshot() {
  const ranks = vocab.words.map((w) => String(w.rank));
  const seenIds = ranks.filter((id) => srsAll[id]);
  const buckets = {
    fresh: ranks.length - seenIds.length,
    learning: seenIds.filter((id) => boxOf(id) >= 1 && boxOf(id) <= 2).length,
    young: seenIds.filter((id) => boxOf(id) >= 3 && boxOf(id) <= 4).length,
    mature: seenIds.filter((id) => boxOf(id) >= 5).length,
  };
  const known = buckets.young + buckets.mature;
  // Qur'an coverage: the share of all word occurrences you can now understand,
  // using each word's corpus frequency (the standard coverage method in
  // vocabulary research — 95–98% is where reading gets comfortable).
  const knownTokens = vocab.words.reduce((n, w) => n + (boxOf(String(w.rank)) >= 3 ? w.count : 0), 0);
  return {
    letters: progressCount('letters'),
    known,
    memorised: progressCount('memorised'),
    surahs: progressCount('surahs'),
    verses: progressCount('verses'),
    due: dueIds(srsAll).length,
    buckets,
    coverage: vocab.total_tokens ? knownTokens / vocab.total_tokens : 0,
    taught: ranks.length,
  };
}

function lastBackupText() {
  const t = get('lastBackupAt', null);
  if (!t) return 'No backup yet — download one below.';
  const d = new Date(t);
  return `Last backup: ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return 'unknown date';
  }
};

// ---------- the daily goal ----------

function goalCard() {
  const g = goal();
  const reps = activity.repsOf(activity.day());
  const pct = Math.min(100, Math.round((reps / g) * 100));
  const done = reps >= g;
  const used = activity.daysUsed();
  return `<section class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h3 style="margin:0">Today</h3>
      <span class="muted">${used} day${used === 1 ? '' : 's'} used so far</span>
    </div>
    <div class="goal-line">
      <b>${reps}</b><span class="muted">/ ${g} reps</span>
      ${done ? '<span class="goal-done">✓ Done for today</span>' : ''}
    </div>
    <div class="goal-bar" role="img" aria-label="${reps} of ${g} reps today"><i style="width:${pct}%"></i></div>
    <div class="row goal-presets">
      <span class="muted">Daily goal</span>
      ${GOAL_PRESETS.map((n) => `<button type="button" class="chip-pick ${n === g ? 'on' : ''}" data-goal="${n}">${n}</button>`).join('')}
      <span class="muted">reps</span>
    </div>
    <p class="muted">One rep = one review, quiz answer, trace check, listen repetition or recall answer. Any amount counts — this is a target, not a streak.</p>
  </section>`;
}

// ---------- Qur'an coverage ----------

function coverageCard(s) {
  const pct = s.coverage * 100;
  const bar = Math.min(100, pct);
  return `<section class="card">
    <h3>Qur'an coverage</h3>
    <div class="cov-num">
      <b>${pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1)}%</b>
      <span class="muted">of the Qur'an's words you can now understand</span>
    </div>
    <div class="cov-bar" role="img" aria-label="${pct.toFixed(1)}% coverage">
      <i style="width:${bar}%"></i>
      <span class="cov-tick" style="left:95%" data-label="95%"></span>
      <span class="cov-tick" style="left:98%" data-label="98%"></span>
    </div>
    <div class="cov-legend"><span>0%</span><span class="muted">research range for comfortable comprehension: 95–98%</span><span>100%</span></div>
    <p class="muted" style="margin-top:1.2rem">${s.known} of the ${s.taught} taught words known. These 500 words cover
    <strong>56.05%</strong> of the Qur'an's ${fmt(vocab.total_tokens)} word occurrences, so this bar passes the ticks only
    when the word list grows beyond them — the markers show where reading gets comfortable.</p>
  </section>`;
}

// ---------- words by strength ----------

function bucketsCard(s) {
  const b = s.buckets;
  const link = (href, n, label, cls) =>
    `<a class="bucket ${cls || ''}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
  const dueWeak = dueIds(srsAll).filter((id) => /^\d+$/.test(id) && boxOf(id) >= 1 && boxOf(id) <= 2).length;
  return `<section class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h3 style="margin:0">Words by strength</h3>
      <span class="muted">tap to review a group</span>
    </div>
    <div class="bucket-row">
      ${link('words.html#review', b.fresh, 'new')}
      ${link('words.html#review/b12', b.learning, 'learning')}
      ${link('words.html#review/b34', b.young, 'young')}
      ${link('words.html#review/b5', b.mature, 'mature', 'mature')}
    </div>
    <p class="muted">Spacing: 1 · 3 · 7 · 14 · 30 days. “Mature” words have survived a 30-day gap — that is what makes
    the coverage number above real.${dueWeak ? ` <a href="words.html#review/b12">${dueWeak} learning word${dueWeak === 1 ? '' : 's'} due now →</a>` : ''}</p>
  </section>`;
}

// ---------- review forecast ----------

function forecastCard() {
  const today0 = startOfDay(new Date());
  const bars = [...Array(30)].map(() => 0);
  for (const e of Object.values(srsAll)) {
    const off = Math.round((startOfDay(new Date(e.due || 0)) - today0) / DAY_MS);
    bars[Math.max(0, Math.min(29, off))] += 1; // nothing due yet (or overdue) lands on today
  }
  const max = Math.max(1, ...bars);
  const sum = (n) => bars.slice(0, n).reduce((a, b) => a + b, 0);
  return `<section class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h3 style="margin:0">Reviews coming up</h3>
      ${bars[0] ? '<a href="words.html#review">Review now →</a>' : '<span class="muted">nothing due</span>'}
    </div>
    <p class="muted">${bars[0]} due today (incl. overdue) · ${sum(7)} in the next 7 days · ${sum(30)} in 30 days</p>
    <div class="forecast" aria-hidden="true">
      ${bars
        .map(
          (n, i) =>
            `<i class="${i === 0 ? 'today' : n ? '' : 'zero'}" style="height:${n ? Math.max(8, Math.round((n / max) * 100)) : 3}%" title="${i === 0 ? 'today' : `in ${i} day${i === 1 ? '' : 's'}`}: ${n}"></i>`,
        )
        .join('')}
    </div>
    <div class="cov-legend"><span>today</span><span class="muted">next 30 days</span></div>
  </section>`;
}

// ---------- per-drill stats ----------

function drillsCard() {
  const t = activity.totals(activity.range(30));
  const acc = activity.accuracy(t);
  const pct = (p) => (p == null ? '—' : `${p}%`);
  const row = (name, cells) => `<tr><td>${name}</td>${cells.map((c) => `<td class="dim">${c}</td>`).join('')}</tr>`;
  const rounds = (n) => `${n || 0} round${n === 1 ? '' : 's'}`;
  return `<section class="card">
    <h3>Drills <span class="muted">· last 30 days</span></h3>
    <table class="drill-table">
      ${row('Read it', [rounds(t.quizReadRounds), `best ${activity.best('bestRead')}/10`, `${t.quizRead || 0} answers · ${pct(acc.per.quizRead.pct)}`])}
      ${row('Understand it', [rounds(t.quizMeaningRounds), `best ${activity.best('bestMeaning')}/10`, `${t.quizMeaning || 0} answers · ${pct(acc.per.quizMeaning.pct)}`])}
      ${row('Trace', [`${t.traces || 0} check${t.traces === 1 ? '' : 's'}`, `${t.tracesOk || 0} passed`, pct(acc.per.traces.pct)])}
      ${row('Listen', [`${t.listens || 0} reps`, `${activity.day().listens || 0} today`, '—'])}
      ${row('Recall', [`${t.recalls || 0} answered`, pct(acc.per.recalls.pct), '—'])}
    </table>
    <p class="muted">${acc.n ? `Graded answers: <strong>${acc.pct}%</strong> correct of ${fmt(acc.n)} across all drills.` : 'Nothing graded in the last 30 days — the drills will fill this in.'}</p>
  </section>`;
}

// ---------- letters ----------

function lettersCard(s) {
  const cells = letters
    .map((l) => {
      const on = isLearned('letters', l.id);
      return `<a class="letter-cell ${on ? 'on' : ''}" href="letters.html" title="${esc(l.name)}" lang="ar" dir="rtl">${esc(l.ar)}</a>`;
    })
    .join('');
  return `<section class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h3 style="margin:0">Letters <span class="muted">· ${s.letters}/28</span></h3>
      <a class="muted" href="letters.html">Practise →</a>
    </div>
    <div class="letter-grid">${cells}</div>
    <p class="muted">Filled tiles are letters you have marked as learned. Tracing and audio live on the Letters page.</p>
  </section>`;
}

// ---------- activity heatmap ----------

function heatCard() {
  const days = activity.range(84);
  const cells = days.map(({ key, d }) => {
    const reps = activity.repsOf(d);
    const lvl =
      reps === 0 ? (d.visits ? 'v' : '') : reps < 10 ? 'l1' : reps < 30 ? 'l2' : reps < 60 ? 'l3' : 'l4';
    const dt = activity.keyToDate(key);
    const label = dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const title = reps ? `${label} — ${reps} rep${reps === 1 ? '' : 's'}` : d.visits ? `${label} — opened` : `${label} — nothing`;
    return `<span class="${lvl}" title="${esc(title)}"></span>`;
  });
  const pad = days[0] ? activity.keyToDate(days[0].key).getDay() : 0;
  const padded = [...Array(pad).fill('<span style="visibility:hidden"></span>'), ...cells];
  const cols = [];
  for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7).join(''));
  const totalReps = days.reduce((n, { d }) => n + activity.repsOf(d), 0);
  return `<section class="card">
    <h3>Activity <span class="muted">· last 12 weeks</span></h3>
    <p class="muted">Every day you opened the app, shaded by how much you did. A record, not a streak.</p>
    <div class="heat" aria-hidden="true">${cols.map((c) => `<div class="heat-col">${c}</div>`).join('')}</div>
    <div class="heat-key"><span class="v"></span> opened · <span class="l1"></span><span class="l2"></span><span class="l3"></span><span class="l4"></span> reps</div>
    <p class="muted" style="margin:0.35rem 0 0">${activity.daysUsed()} days used · ${fmt(totalReps)} reps in 12 weeks</p>
  </section>`;
}

// ---------- listening & reading volume ----------

function volumeCard() {
  const wk = activity.totals(activity.range(7));
  const mo = activity.totals(activity.range(30));
  const verses = (get('progress', {}) || {}).verses || {};
  const versesWk = Object.values(verses).filter((v) => v && v.at && Date.now() - v.at < 7 * DAY_MS).length;
  return `<section class="card">
    <h3>Listening &amp; reading</h3>
    <div class="stat-grid">
      ${stat(fmtMin(wk.listenSec), 'Listened · 7 days')}
      ${stat(fmtMin(wk.readSec), 'Read · 7 days')}
      ${stat(fmtMin(mo.listenSec), 'Listened · 30 days')}
      ${stat(fmtMin(mo.readSec), 'Read · 30 days')}
    </div>
    ${versesWk ? `<p class="muted">${versesWk} new verse${versesWk === 1 ? '' : 's'} marked read this week.</p>` : ''}
    <p class="muted">Counted from audio that actually played and from time the reader sat open and visible — nothing is estimated.</p>
  </section>`;
}

// ---------- memorised verses ----------

function memorisedCard() {
  const memo = (get('progress', {}) || {}).memorised || {};
  const surahs = (get('progress', {}) || {}).surahs || {};
  const wholeSurahs = Object.keys(surahs)
    .filter((s) => /^\d+$/.test(s))
    .map(Number)
    .sort((a, b) => a - b);
  const refs = Object.keys(memo)
    .filter((r) => /^\d+:\d+$/.test(r))
    .sort((x, y) => {
      const [sx, ax] = x.split(':').map(Number);
      const [sy, ay] = y.split(':').map(Number);
      return sx - sy || ax - ay;
    });

  if (!refs.length && !wholeSurahs.length) {
    return `<section class="card">
      <h3>Verses memorised</h3>
      <p class="muted">Nothing yet — open any verse in the <a href="verses.html">Verses reader</a>
      and tap the ✓ button to mark it, or mark an entire surah with “✓ Memorise surah”. This is your own
      tracker: you decide when a verse or surah is solid.</p>
    </section>`;
  }

  const wholeSet = new Set(wholeSurahs);
  const bySurah = new Map();
  for (const r of refs) {
    const s = Number(r.split(':')[0]);
    if (wholeSet.has(s)) continue; // superseded by the whole-surah mark (data kept)
    if (!bySurah.has(s)) bySurah.set(s, []);
    bySurah.get(s).push(r);
  }
  const visibleCount = [...bySurah.values()].reduce((n, list) => n + list.length, 0);
  const wholeVerseCount = wholeSurahs.reduce(
    (n, sid) => n + ((surahNames.get(sid) || {}).verses_count || 0),
    0,
  );
  const totalVerses = visibleCount + wholeVerseCount;

  const nameOf = (sid) => {
    const nm = surahNames.get(sid);
    return esc(nm ? nm.name_simple : 'Surah ' + sid);
  };

  return `<section class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h3 style="margin:0">Verses memorised <span class="muted">· ${totalVerses}${wholeSurahs.length ? ` · ${wholeSurahs.length} surah${wholeSurahs.length === 1 ? '' : 's'}` : ''}</span></h3>
      <a class="muted" href="verses.html">Open reader →</a>
    </div>
    ${wholeSurahs
      .map((sid) => {
        const nm = surahNames.get(sid);
        return `<div class="memo-row whole">
          <div class="memo-row-head">
            <strong>${nameOf(sid)} <span class="muted">${sid}</span> <span class="whole-tag">whole surah ✓</span></strong>
            <button type="button" class="chip-x" data-surah="${sid}" aria-label="Remove ${nameOf(sid)}">✕</button>
          </div>
          <div class="memo-chips"><span class="muted">${nm ? `${nm.verses_count} verses` : ''}</span></div>
        </div>`;
      })
      .join('')}
    ${[...bySurah.entries()]
      .map(
        ([sid, list]) => `<div class="memo-row">
          <div class="memo-row-head">
            <strong>${nameOf(sid)}</strong>
            <span class="muted">${list.length} verse${list.length === 1 ? '' : 's'}</span>
          </div>
          <div class="memo-chips">
            ${list
              .map(
                (r) =>
                  `<span class="memo-chip"><a href="verses.html#${r}">${r}</a><button type="button" class="chip-x" data-ref="${r}" aria-label="Remove ${r}">✕</button></span>`,
              )
              .join('')}
          </div>
        </div>`,
      )
      .join('')}
  </section>`;
}

function syncWhenText() {
  const t = get('sync.lastSync', null);
  if (!t) return 'Not synced yet';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `Synced ${h} h ago`;
  return `Synced ${fmtDate(new Date(t).toISOString())}`;
}

// Cloud sync status line — folded into the "Your data" card. The header account
// button (chrome.js, top-right) is the primary sign-in control.
function syncLine() {
  if (!configured()) return '';
  const s = session();
  if (!s) {
    return `<p class="muted" id="sync-line">Cloud sync (optional):
    <button type="button" class="btn-link" id="sync-in">sign in with Google</button>
    to keep one progress across your devices.</p>`;
  }
  const email = (s.user && s.user.email) || 'your account';
  return `<p class="muted" id="sync-line">Cloud sync: <strong>${esc(email)}</strong> ·
    <span id="sync-when">${esc(syncWhenText())}</span> ·
    <button type="button" class="btn-link" id="sync-out">Sign out</button>
    <span id="sync-status"></span></p>`;
}

// ---------- tabs ----------

const TABS = [
  ['overview', 'Overview'],
  ['stats', 'Stats'],
  ['memorised', 'Memorised'],
  ['data', 'Data'],
];

const tabFromHash = () => {
  const h = location.hash.replace(/^#/, '');
  return TABS.some(([id]) => id === h) ? h : 'overview';
};

const tabBar = (tab) => `<nav class="seg pr-tabs" aria-label="Progress sections">
  ${TABS.map(([id, label]) => `<a href="#${id}" class="${id === tab ? 'active' : ''}">${label}</a>`).join('')}
</nav>`;

const tileCard = (s) => `<section class="card">
  <div class="stat-grid">
    ${stat(`${s.letters}/28`, 'Letters learned')}
    ${stat(s.known, 'Words known')}
    ${stat(s.surahs, 'Surahs memorised')}
    ${stat(s.verses, 'Verses read')}
  </div>
</section>`;

const dueCard = (s) =>
  s.due
    ? `<section class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span>${s.due} review${s.due === 1 ? '' : 's'} ready</span>
        <a class="btn" href="words.html#review">Review now</a>
      </div>
    </section>`
    : `<section class="card"><p class="muted center">Nothing due right now — every card is scheduled ahead. ✓</p></section>`;

function dataCards() {
  return `<section class="card">
      <h3>Your data</h3>
      <p class="muted">Your progress lives on this device. The two ways it ever leaves: the backup file
      below, and cloud sync — sign in from the account button (top-right). Nothing else is uploaded, and there is no tracking.</p>
      ${syncLine()}
      <p class="muted" id="last-backup">${esc(lastBackupText())}</p>
      <div class="row">
        <button type="button" class="btn" id="export">Download backup</button>
        <button type="button" class="btn btn-ghost" id="import">Import backup…</button>
        <input type="file" id="file" accept=".json,application/json" hidden>
      </div>
      <div id="import-box" hidden></div>
    </section>

    <section class="card">
      <h3>Reset</h3>
      <p class="muted">Erase all progress on this device — letters, reviews, verses. This cannot be undone.</p>
      <div class="row"><button type="button" class="btn btn-ghost" id="reset">Reset all progress</button></div>
      <div id="reset-box" hidden></div>
    </section>`;
}

function render() {
  const s = snapshot();
  const tab = tabFromHash();
  const body =
    tab === 'stats'
      ? `${bucketsCard(s)}${forecastCard()}${drillsCard()}${lettersCard(s)}${heatCard()}${volumeCard()}`
      : tab === 'memorised'
        ? memorisedCard()
        : tab === 'data'
          ? dataCards()
          : `${goalCard()}${tileCard(s)}${coverageCard(s)}${dueCard(s)}`;

  main.innerHTML = `
    <h2>Progress</h2>
    ${tabBar(tab)}
    ${body}`;

  wire();

  for (const b of main.querySelectorAll('.chip-x')) {
    b.addEventListener('click', () => {
      if (b.dataset.surah) unmark('surahs', b.dataset.surah);
      else unmark('memorised', b.dataset.ref);
      toast('Removed from memorised');
      render();
    });
  }

  for (const b of main.querySelectorAll('.chip-pick[data-goal]')) {
    b.addEventListener('click', () => {
      set('prefs', { ...get('prefs', {}), dailyGoalReps: Number(b.dataset.goal) });
      render();
    });
  }
}

function wire() {
  // cloud sync
  const syncStatus = (msg) => {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = msg;
  };

  const inBtn = document.getElementById('sync-in');
  if (inBtn) inBtn.addEventListener('click', () => signIn());

  const outBtn = document.getElementById('sync-out');
  if (outBtn) {
    outBtn.addEventListener('click', () => {
      signOut();
      toast('Signed out — progress stays on this device');
      render();
    });
  }

  // export (Data tab only)
  const exportBtn = document.getElementById('export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      downloadBackup();
      set('lastBackupAt', Date.now());
      document.getElementById('last-backup').textContent = lastBackupText();
      toast('Backup downloaded');
    });
  }

  // import (Data tab only)
  const file = document.getElementById('file');
  const box = document.getElementById('import-box');
  const importBtn = document.getElementById('import');
  if (importBtn) importBtn.addEventListener('click', () => file.click());

  file?.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    let obj = null;
    try {
      obj = JSON.parse(await f.text());
    } catch {
      box.hidden = false;
      box.innerHTML = '<p class="danger-text">That file is not valid JSON.</p>';
      return;
    }
    const v = validateImport(obj);
    if (!v.ok) {
      box.hidden = false;
      box.innerHTML = `<p class="danger-text">${esc(v.reason)}</p>`;
      return;
    }
    const cur = summarize(collect());
    box.hidden = false;
    box.innerHTML = `
      <div class="confirm-box">
        <p><strong>${esc(f.name)}</strong>${obj.exported ? ` — exported ${esc(fmtDate(obj.exported))}` : ''}</p>
        <p class="muted">Contains: ${v.stats.letters} letters · ${v.stats.words} words met · ${v.stats.memorised || 0} memorised verses · ${v.stats.surahs || 0} surahs · ${v.stats.verses} verses · ${v.stats.reviews} review cards · ${v.stats.days} active days.</p>
        <p class="muted">Your current data: ${cur.letters} letters · ${cur.words} words · ${cur.verses} verses · ${cur.reviews} cards.</p>
        <p class="muted">Importing replaces your current progress.</p>
        <div class="row">
          <button type="button" class="btn" id="do-import">Replace my progress</button>
          <button type="button" class="btn btn-ghost" id="cancel-import">Cancel</button>
        </div>
      </div>`;
    document.getElementById('do-import').addEventListener('click', () => {
      applyImport(obj);
      set('lastBackupAt', Date.now());
      toast('Backup imported');
      file.value = '';
      render();
    });
    document.getElementById('cancel-import').addEventListener('click', () => {
      box.hidden = true;
      box.innerHTML = '';
      file.value = '';
    });
  });

  // reset (two-step, Data tab only)
  const rbox = document.getElementById('reset-box');
  const resetBtn = document.getElementById('reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    rbox.hidden = false;
    rbox.innerHTML = `
      <div class="confirm-box">
        <p><strong>Erase everything?</strong> All letters, reviews and verses — gone from this device.</p>
        <p class="muted">Tip: download a backup first if you might come back.</p>
        <div class="row">
          <button type="button" class="btn danger-btn" id="do-reset">Erase all progress</button>
          <button type="button" class="btn btn-ghost" id="cancel-reset">Cancel</button>
        </div>
      </div>`;
    document.getElementById('do-reset').addEventListener('click', () => {
      const theme = get('theme', null);
      clearAll();
      if (theme) set('theme', theme);
      toast('Progress erased');
      render();
    });
    document.getElementById('cancel-reset').addEventListener('click', () => {
      rbox.hidden = true;
      rbox.innerHTML = '';
    });
  });
}

async function init() {
  captureSession(); // pick up a fresh Google sign-in from the URL hash
  activity.migrate();
  try {
    const [idx, voc, lets] = await Promise.all([
      loadData('quran/index.json'),
      loadData('vocabulary.json'),
      loadData('letters.json'),
    ]);
    surahNames = new Map(idx.surahs.map((s) => [s.id, s]));
    vocab = { words: voc.words || [], total_tokens: voc.total_tokens || 1 };
    letters = lets || [];
  } catch {
    surahNames = new Map();
  }
  srsAll = loadSRS();
  render();

  // Tabs: the hash selects the section (#stats / #memorised / #data), so the
  // account menu can deep-link into them. Switching scrolls back to the top.
  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo({ top: 0 });
  });

  // Reconcile in the background; keep the "synced" line fresh afterwards.
  if (configured() && signedIn()) {
    const stampWhen = () => {
      const when = document.getElementById('sync-when');
      if (when) when.textContent = syncWhenText();
    };
    document.addEventListener('qa:sync', stampWhen);
    syncNow().then((res) => {
      if (res && res.ok) {
        srsAll = loadSRS(); // a sync may have brought new words from another device
        stampWhen();
      }
    });
  }
}

init();
