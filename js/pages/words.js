// Words module shell — three modes on one page:
//   Browse  the most frequent Quranic words (top 500: core 150 + more; tap to hear)
//   Review  flashcard recall with expanding-interval spaced repetition
//   Build   assemble words from letter tiles (js/ui/build-game.js)
// The mode lives in the URL hash (#browse / #review / #build), and Build
// accepts a letter filter (#build/kaf) so other pages can deep-link into it.
import { loadData } from '../lib/data.js';
import { wbwFromRef } from '../lib/audio.js';
import { play } from '../ui/player.js';
import { mark } from '../lib/progress.js';
import { load as loadSRS, review, dueIds } from '../lib/srs.js';
import { mountBuild } from '../ui/build-game.js';

const main = document.querySelector('main');
const NEW_PER_SESSION = 10;
const CORE = 150; // the original verified core set
let words = [];
let vocabLoaded = false;

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MODES = [
  ['browse', 'Browse'],
  ['review', 'Review'],
  ['build', 'Build'],
];

function parseHash() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('build')) return { mode: 'build', letter: h.split('/')[1] || null };
  if (h === 'review') return { mode: 'review', letter: null };
  return { mode: 'browse', letter: null };
}

async function ensureVocab() {
  if (vocabLoaded) return;
  const v = await loadData('vocabulary.json');
  words = v.words;
  vocabLoaded = true;
}

const byRank = (id) => words.find((w) => String(w.rank) === String(id));

function buildQueue() {
  const all = loadSRS();
  const due = dueIds(all).filter((id) => /^\d+$/.test(id));
  const fresh = words
    .filter((w) => !all[String(w.rank)])
    .slice(0, NEW_PER_SESSION)
    .map((w) => String(w.rank));
  return [...due, ...fresh];
}

// ---------- modes ----------

function renderBrowse(view) {
  view.innerHTML = `
    <p class="muted">The most frequent words of the Qur'an — tap any word to hear it.</p>
    <div class="word-list" id="word-list"></div>
    <div class="row" style="justify-content:center;margin-top:10px" id="more-wrap"></div>`;

  const list = view.querySelector('#word-list');
  const addRow = (w) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'word-row';
    row.innerHTML = `
      <span class="w-ar" lang="ar" dir="rtl">${esc(w.ar)}</span>
      <span class="w-info">
        <span class="w-gloss">${esc(w.gloss)}</span>
        <span class="w-meta">${esc(w.translit)} · ${w.count.toLocaleString()}× · first at ${esc(w.ref)}</span>
      </span>
      <span class="w-rank">#${w.rank}</span>`;
    row.addEventListener('click', () => {
      play(wbwFromRef(w.audio), w.ar);
      row.classList.add('active');
      setTimeout(() => row.classList.remove('active'), 700);
    });
    list.appendChild(row);
  };

  const core = words.slice(0, CORE);
  const rest = words.slice(CORE);
  for (const w of core) addRow(w);

  const wrap = view.querySelector('#more-wrap');
  if (rest.length) {
    wrap.innerHTML = `<button type="button" class="btn btn-ghost" id="more">Show ${rest.length} more words ▾</button>`;
    view.querySelector('#more').addEventListener('click', () => {
      const divider = document.createElement('div');
      divider.className = 'word-divider';
      divider.textContent = `more frequent words — ranks ${CORE + 1}–${words.length}`;
      list.appendChild(divider);
      for (const w of rest) addRow(w);
      wrap.remove();
    });
  } else {
    wrap.remove();
  }
}

function renderReview(view) {
  const all = loadSRS();
  const seen = Object.keys(all).filter((id) => /^\d+$/.test(id)).length;
  const known = Object.entries(all).filter(([id, e]) => /^\d+$/.test(id) && e.box >= 3).length;
  const queue = buildQueue();

  view.innerHTML = `
    <section class="card">
      <div class="row stats-row">
        <div class="stat center"><div class="n">${seen}</div><div class="l">seen of ${words.length}</div></div>
        <div class="stat center"><div class="n">${known}</div><div class="l">known</div></div>
        <div class="stat center"><div class="n">${queue.length}</div><div class="l">in queue</div></div>
      </div>
      <div class="row">
        <button type="button" class="btn" id="review" ${queue.length ? '' : 'disabled'}>${
          queue.length ? `Review ${queue.length}` : 'All caught up for today'
        }</button>
      </div>
    </section>
    <p class="muted">Flashcards: read the word, recall the meaning, then grade yourself honestly —
    misses come back first (spacing: 1 · 3 · 7 · 14 · 30 days).</p>`;

  const btn = view.querySelector('#review');
  if (queue.length) btn.addEventListener('click', () => startSession(view, queue));
}

function startSession(view, queue) {
  let i = 0;
  let got = 0;

  function render() {
    if (i >= queue.length) return renderDone();
    const w = byRank(queue[i]);

    view.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← Review</button>
      <p class="muted center">${i + 1} / ${queue.length}</p>
      <div class="flashcard" id="card" role="button" tabindex="0">
        <div class="fc-word" lang="ar" dir="rtl">${esc(w.ar)}</div>
        <div class="fc-translit">${esc(w.translit)}</div>
        <div class="fc-en">${esc(w.gloss)}</div>
        <div class="fc-hint">tap to reveal</div>
      </div>
      <div class="fc-actions" id="actions" hidden>
        <button type="button" class="btn btn-ghost" id="again">Again</button>
        <button type="button" class="btn" id="know">Got it</button>
      </div>`;

    const card = view.querySelector('#card');
    const actions = view.querySelector('#actions');
    const reveal = () => {
      if (card.classList.contains('revealed')) return;
      card.classList.add('revealed');
      card.querySelector('.fc-hint').textContent = 'how did you do?';
      actions.hidden = false;
      play(wbwFromRef(w.audio), w.ar);
    };
    card.addEventListener('click', reveal);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        reveal();
      }
    });

    view.querySelector('#exit').addEventListener('click', backToReview);
    view.querySelector('#again').addEventListener('click', () => grade(w, false));
    view.querySelector('#know').addEventListener('click', () => grade(w, true));
  }

  function grade(w, good) {
    const first = !loadSRS()[String(w.rank)];
    review(String(w.rank), good);
    if (first || good) mark('words', String(w.rank));
    if (good) got += 1;
    i += 1;
    render();
  }

  function backToReview() {
    renderReview(view);
  }

  function renderDone() {
    view.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← Review</button>
      <section class="card center">
        <h2>Session done</h2>
        <p>${got} of ${queue.length} recalled. Words you missed will come back first next time.</p>
        <div class="row" style="justify-content:center">
          <button type="button" class="btn" id="home">Back to review</button>
        </div>
      </section>`;
    view.querySelector('#exit').addEventListener('click', backToReview);
    view.querySelector('#home').addEventListener('click', backToReview);
  }

  render();
}

// ---------- router ----------

async function render() {
  const { mode, letter } = parseHash();
  main.innerHTML = `
    <nav class="seg" aria-label="Words sections">
      ${MODES.map(([m, label]) => `<a href="#${m}" data-m="${m}" class="${m === mode ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    <div id="view"><p class="muted">Loading…</p></div>`;
  const view = main.querySelector('#view');

  if (mode === 'build') return mountBuild(view, { firstLetter: letter });

  try {
    await ensureVocab();
  } catch (e) {
    view.innerHTML = `<section class="card"><p>Could not load vocabulary: ${e.message}</p></section>`;
    return;
  }
  if (mode === 'review') renderReview(view);
  else renderBrowse(view);
}

window.addEventListener('hashchange', render);
render();
