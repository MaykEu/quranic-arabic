// Letters module: 28-letter grid → letter detail (forms + sound) → tracing practice.
// Harakat cards and a connected-letters explainer live below the grid.
import { loadData } from '../lib/data.js';
import { play } from '../ui/player.js';
import { toast } from '../ui/toast.js';
import { mountTrace } from '../ui/trace.js';
import { mark, unmark, isLearned, count } from '../lib/progress.js';

const main = document.querySelector('main');
let letters = [];
let harakat = [];

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';

async function init() {
  try {
    [letters, harakat] = await Promise.all([loadData('letters.json'), loadData('harakat.json')]);
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load letter data: ${e.message}</p></section>`;
    return;
  }
  renderGrid();
}

function renderGrid() {
  main.innerHTML = `
    <h2>Letters <span class="muted">· ${count('letters')}/28 learned</span></h2>
    <p class="muted">Tap a letter to see its forms, hear its sound, and practice writing it.</p>
    <div class="letter-grid" id="letter-grid"></div>

    <h2 class="section-title">Harakat — vowels &amp; marks</h2>
    <div class="harakat-grid" id="harakat-grid"></div>

    <h2 class="section-title">Connected letters</h2>
    <section class="card">
      <p class="sample-joins" lang="ar" dir="rtl">بـ ـبـ ـب</p>
      <p class="muted">Most letters change shape with their position in a word — those are the four
      forms you see on every letter page. Six letters
      <span class="ar" lang="ar" dir="rtl">ا د ذ ر ز و</span> never join the letter that follows,
      which is what creates the small gaps inside words.</p>
    </section>`;

  const grid = main.querySelector('#letter-grid');
  for (const l of letters) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'letter-cell' + (isLearned('letters', l.id) ? ' learned' : '');
    el.setAttribute('aria-label', `${l.name} — ${l.sound}`);
    el.innerHTML = `<span class="glyph" lang="ar" dir="rtl">${l.ar}</span><span class="lname">${l.name}</span>`;
    el.addEventListener('click', () => renderDetail(l.id));
    grid.appendChild(el);
  }

  main.querySelector('#harakat-grid').innerHTML = harakat
    .map(
      (h) => `
      <div class="card haraka">
        <div class="h-glyph" lang="ar" dir="rtl">${h.display}</div>
        <div class="hname">${h.name}</div>
        <div class="muted">${h.sound}</div>
      </div>`
    )
    .join('');
}

function renderDetail(id) {
  const l = letters.find((x) => x.id === id);
  const learned = isLearned('letters', id);
  const cell = (v) => (v ? `<span class="ar" lang="ar" dir="rtl">${v}</span>` : '<span class="none">—</span>');

  main.innerHTML = `
    <button type="button" class="btn btn-ghost back" id="back">← All letters</button>
    <section class="card letter-detail">
      <div class="glyph-xl" lang="ar" dir="rtl">${l.ar}</div>
      <h2>${l.name} <span class="ar">${l.name_ar}</span></h2>
      <p class="muted">sound: /${l.sound}/ · ${l.connects_forward ? 'joins the following letter' : 'never joins the following letter'}</p>
      <div class="row">
        ${l.audio ? `<button type="button" class="btn" id="play">${PLAY_SVG} Hear it</button>` : ''}
        <button type="button" class="btn ${learned ? 'btn-ghost' : ''}" id="learn">${learned ? 'Learned — undo' : 'Mark as learned'}</button>
      </div>
    </section>

    <section class="card">
      <h3>Forms</h3>
      <table class="forms-table">
        <thead>
          <tr><th>Isolated</th><th>Initial</th><th>Medial</th><th>Final</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${cell(l.forms.isolated)}</td>
            <td>${cell(l.forms.initial)}</td>
            <td>${cell(l.forms.medial)}</td>
            <td>${cell(l.forms.final)}</td>
          </tr>
        </tbody>
      </table>
      ${l.connects_forward ? '' : '<p class="muted">This letter only joins from the right — it has no initial or medial form.</p>'}
    </section>

    ${l.sample ? `
    <section class="card">
      <h3>In a word</h3>
      <p class="big ar" lang="ar" dir="rtl">${l.sample.ar}</p>
      <p class="muted">${l.sample.translit} — ${l.sample.en}</p>
    </section>` : ''}

    <div class="row">
      <button type="button" class="btn" id="trace">Practice writing</button>
    </div>`;

  main.querySelector('#back').addEventListener('click', renderGrid);
  if (l.audio) {
    main.querySelector('#play').addEventListener('click', () => play(`assets/audio/${l.audio}`, l.name));
  }
  main.querySelector('#learn').addEventListener('click', () => {
    if (isLearned('letters', id)) {
      unmark('letters', id);
    } else {
      mark('letters', id);
      toast(`${l.name} marked as learned`);
    }
    renderDetail(id);
  });
  main.querySelector('#trace').addEventListener('click', () => renderTrace(id));
}

function renderTrace(id) {
  const l = letters.find((x) => x.id === id);

  main.innerHTML = `
    <button type="button" class="btn btn-ghost back" id="back">← ${l.name}</button>
    <h2>Practice: <span class="ar" lang="ar" dir="rtl">${l.ar}</span></h2>
    <div id="trace-slot"></div>
    <div class="trace-actions">
      <button type="button" class="btn" id="check">Check</button>
      <button type="button" class="btn btn-ghost" id="erase">Erase</button>
    </div>
    <p class="center muted" id="trace-msg">Trace over the dashed letter with your finger or mouse.</p>`;

  const trace = mountTrace(main.querySelector('#trace-slot'), l.ar);

  main.querySelector('#erase').addEventListener('click', () => trace.clear());
  main.querySelector('#check').addEventListener('click', () => {
    const score = trace.checkCoverage();
    const msg = main.querySelector('#trace-msg');
    if (score >= 0.6) {
      mark('letters', l.id);
      msg.textContent = `Nice — ${Math.round(score * 100)}% of the letter covered. Marked as learned.`;
      toast(`${l.name} marked as learned`);
      setTimeout(() => renderDetail(l.id), 900);
    } else {
      msg.textContent = `Almost — ${Math.round(score * 100)}% covered. Trace a little more and check again.`;
    }
  });
  main.querySelector('#back').addEventListener('click', () => renderDetail(id));
}

init();
