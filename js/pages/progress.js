// Progress page: your stats at a glance, a 7-day activity strip, what's due,
// and your data — download a backup, import one, or reset everything.
// Everything lives on this device only (localStorage, qa.v1. namespace).
import { load as loadSRS, dueIds } from '../lib/srs.js';
import { count as progressCount, activeDays } from '../lib/progress.js';
import { get, set, clearAll } from '../lib/store.js';
import { downloadBackup, validateImport, applyImport, summarize, collect } from '../lib/backup.js';
import { toast } from '../ui/toast.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const stat = (value, label) => `<div class="stat"><b>${esc(String(value))}</b><span class="muted">${esc(label)}</span></div>`;

function snapshot() {
  const srsAll = loadSRS();
  const ids = Object.keys(srsAll);
  return {
    letters: progressCount('letters'),
    words: ids.filter((id) => /^\d+$/.test(id) || id.startsWith('b:')).length,
    known: ids.filter((id) => /^\d+$/.test(id) && srsAll[id] && srsAll[id].box >= 3).length,
    verses: progressCount('verses'),
    due: dueIds(srsAll).length,
    days: activeDays(),
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

function render() {
  const s = snapshot();
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return { initial: DAY_INITIALS[d.getDay()], active: s.days.includes(d.toISOString().slice(0, 10)) };
  });

  main.innerHTML = `
    <h2>Progress</h2>
    <section class="card">
      <div class="stat-grid">
        ${stat(`${s.letters}/28`, 'Letters learned')}
        ${stat(s.words, 'Words met')}
        ${stat(s.known, 'Words known well')}
        ${stat(s.verses, 'Verses read')}
      </div>
      <div class="week-strip" aria-label="Activity in the last 7 days">
        ${last7.map((d) => `<span class="day-dot ${d.active ? 'on' : ''}">${d.initial}</span>`).join('')}
      </div>
      <p class="muted center">${s.days.length} active day${s.days.length === 1 ? '' : 's'} so far</p>
    </section>

    ${
      s.due
        ? `<section class="card">
             <div class="row" style="justify-content:space-between;align-items:center">
               <span>${s.due} review${s.due === 1 ? '' : 's'} ready</span>
               <a class="btn" href="words.html#review">Review now</a>
             </div>
           </section>`
        : ''
    }

    <section class="card">
      <h3>Your data</h3>
      <p class="muted">Everything is stored only on this device — nothing is uploaded anywhere.
      Download a backup now and then; you can import it on any device (or after clearing your browser).</p>
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

  wire(s);
}

function wire() {
  // export
  document.getElementById('export').addEventListener('click', () => {
    downloadBackup();
    set('lastBackupAt', Date.now());
    document.getElementById('last-backup').textContent = lastBackupText();
    toast('Backup downloaded');
  });

  // import
  const file = document.getElementById('file');
  const box = document.getElementById('import-box');
  document.getElementById('import').addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
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
        <p class="muted">Contains: ${v.stats.letters} letters · ${v.stats.words} words met · ${v.stats.verses} verses · ${v.stats.reviews} review cards · ${v.stats.days} active days.</p>
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

  // reset (two-step)
  const rbox = document.getElementById('reset-box');
  document.getElementById('reset').addEventListener('click', () => {
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

render();
