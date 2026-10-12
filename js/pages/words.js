// Words module: the 150 most frequent Quranic words — a tap-to-hear list plus
// flashcard review with expanding-interval spaced repetition (see js/lib/srs.js).
import { loadData } from '../lib/data.js';
import { wbwFromRef } from '../lib/audio.js';
import { play } from '../ui/player.js';
import { mark } from '../lib/progress.js';
import { load as loadSRS, review, dueIds } from '../lib/srs.js';

const main = document.querySelector('main');
const NEW_PER_SESSION = 10;
let words = [];

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function init() {
  try {
    const v = await loadData('vocabulary.json');
    words = v.words;
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load vocabulary: ${e.message}</p></section>`;
    return;
  }
  renderHome();
}

const byRank = (id) => words.find((w) => String(w.rank) === String(id));

function buildQueue() {
  const all = loadSRS();
  const due = dueIds(all);
  const fresh = words
    .filter((w) => !all[String(w.rank)])
    .slice(0, NEW_PER_SESSION)
    .map((w) => String(w.rank));
  return [...due, ...fresh];
}

function renderHome() {
  const all = loadSRS();
  const seen = Object.keys(all).length;
  const known = Object.values(all).filter((e) => e.box >= 3).length;
  const queue = buildQueue();

  main.innerHTML = `
    <h2>Words <span class="muted">· the top 150</span></h2>
    <p class="muted">The most frequent words of the Qur'an — tap any word to hear it.</p>

    <section class="card">
      <div class="row stats-row">
        <div class="stat center"><div class="n">${seen}</div><div class="l">seen</div></div>
        <div class="stat center"><div class="n">${known}</div><div class="l">known</div></div>
        <div class="stat center"><div class="n">${queue.length}</div><div class="l">in queue</div></div>
      </div>
      <div class="row">
        <button type="button" class="btn" id="review" ${queue.length ? '' : 'disabled'}>${
          queue.length ? `Review ${queue.length}` : 'All caught up for today'
        }</button>
      </div>
    </section>

    <h2 class="section-title">All words</h2>
    <div class="word-list" id="word-list"></div>`;

  const list = main.querySelector('#word-list');
  for (const w of words) {
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
  }

  const btn = main.querySelector('#review');
  if (queue.length) btn.addEventListener('click', () => startSession(queue));
}

function startSession(queue) {
  let i = 0;
  let got = 0;

  function render() {
    if (i >= queue.length) return renderDone();
    const w = byRank(queue[i]);

    main.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← All words</button>
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

    const card = main.querySelector('#card');
    const actions = main.querySelector('#actions');
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

    main.querySelector('#exit').addEventListener('click', renderHome);
    main.querySelector('#again').addEventListener('click', () => grade(w, false));
    main.querySelector('#know').addEventListener('click', () => grade(w, true));
  }

  function grade(w, good) {
    const first = !loadSRS()[String(w.rank)];
    review(String(w.rank), good);
    if (first || good) mark('words', String(w.rank));
    if (good) got += 1;
    i += 1;
    render();
  }

  function renderDone() {
    main.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← All words</button>
      <section class="card center">
        <h2>Session done</h2>
        <p>${got} of ${queue.length} recalled. Words you missed will come back first next time.</p>
        <div class="row" style="justify-content:center">
          <button type="button" class="btn" id="home">Back to words</button>
        </div>
      </section>`;
    main.querySelector('#exit').addEventListener('click', renderHome);
    main.querySelector('#home').addEventListener('click', renderHome);
  }

  render();
}

init();
