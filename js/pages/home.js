// Home: one primary action (continue where you left off, or start with letters),
// progress numbers, then the four sections as tappable tiles with a line-art icon
// and a small progress bar. No auto task lists — numbers and taps only.
import { load as loadSRS, dueIds } from '../lib/srs.js';
import { count as progressCount } from '../lib/progress.js';
import { loadData } from '../lib/data.js';
import { get } from '../lib/store.js';
import { verseHash } from '../lib/hash.js';

const body = document.getElementById('home-body');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  letters:
    '<svg viewBox="0 0 24 24"><path d="M12 6C10 4.5 7.5 4 4 4v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2z"/><path d="M12 6v14"/></svg>',
  words: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>',
  verses: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  practice: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.7"/></svg>',
};

const stat = (value, label) =>
  `<div class="stat"><b>${esc(String(value))}</b><span class="muted">${esc(label)}</span></div>`;

function snapshot() {
  const srsAll = loadSRS();
  const ids = Object.keys(srsAll);
  return {
    letters: progressCount('letters'),
    known: ids.filter((id) => /^\d+$/.test(id) && srsAll[id] && srsAll[id].box >= 3).length,
    due: dueIds(srsAll).length,
    surahs: progressCount('surahs'),
  };
}

const bar = (pct) =>
  `<span class="tile-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></span>`;

async function init() {
  if (!body) return;
  const s = snapshot();
  const last = get('lastRead', null);

  let lastLabel = null;
  if (last) {
    let name = null;
    try {
      const idx = await loadData('quran/index.json');
      const m = idx.surahs.find((x) => x.id === last.s);
      name = m ? m.name_simple : null;
    } catch {
      /* offline first run — fall back to the number */
    }
    lastLabel = `${name || 'Surah ' + last.s} ${last.s}:${last.a}`;
  }

  body.innerHTML = `
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div>
          <strong>${last ? 'Continue where you left off' : 'Start here'}</strong>
          <div class="muted">${
            last ? esc(lastLabel) : 'Begin with the letters — they unlock everything else.'
          }</div>
        </div>
        <a class="btn" href="${last ? verseHash(last.s, last.a) : 'letters.html'}">${
          last ? 'Continue' : 'Start'
        }</a>
      </div>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:baseline">
        <h3 style="margin:0">Your progress</h3>
        <a class="muted" href="progress.html">Details →</a>
      </div>
      <div class="stat-grid">
        ${stat(`${s.letters}/28`, 'Letters learned')}
        ${stat(s.known, 'Words known')}
        ${stat(s.due, 'Reviews due')}
        ${stat(s.surahs, 'Surahs memorised')}
      </div>
      ${s.due ? `<div class="row"><a class="btn" href="words.html#review">Review ${s.due} now</a></div>` : ''}
    </section>

    <div class="home-grid">
      <a class="home-tile" href="letters.html">
        <span class="tile-ic">${ICONS.letters}</span>
        <strong>Letters</strong>
        <span class="muted">${s.letters}/28 learned</span>
        ${bar(Math.round((s.letters / 28) * 100))}
      </a>
      <a class="home-tile" href="words.html">
        <span class="tile-ic">${ICONS.words}</span>
        <strong>Words</strong>
        <span class="muted">${s.known}/500 known</span>
        ${bar(Math.round((s.known / 500) * 100))}
      </a>
      <a class="home-tile" href="verses.html">
        <span class="tile-ic">${ICONS.verses}</span>
        <strong>Verses</strong>
        <span class="muted">${s.surahs ? `${s.surahs} surah${s.surahs === 1 ? '' : 's'} memorised` : 'Read & listen'}</span>
      </a>
      <a class="home-tile" href="practice.html">
        <span class="tile-ic">${ICONS.practice}</span>
        <strong>Practice</strong>
        <span class="muted">${s.due ? `${s.due} review${s.due === 1 ? '' : 's'} ready` : 'Speak · trace · quiz'}</span>
      </a>
    </div>

    <p class="home-foot muted">New here? <a href="guide.html">How to learn</a> ·
    <a href="basics.html">How Arabic works</a> · <a href="words.html#build">Build words</a></p>`;
}

init();
