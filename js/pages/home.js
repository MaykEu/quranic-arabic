// Home — two clean cards: the learning guide entry point, and your progress
// at a glance (letters, words known, reviews due, continue reading).
import { get } from '../lib/store.js';
import { load as loadSRS, dueIds } from '../lib/srs.js';
import { count as progressCount } from '../lib/progress.js';

function snapshot() {
  const srsAll = loadSRS();
  const ids = Object.keys(srsAll);
  return {
    letters: progressCount('letters'),
    known: ids.filter((id) => /^\d+$/.test(id) && srsAll[id] && srsAll[id].box >= 3).length,
    due: dueIds(srsAll).length,
    verses: progressCount('verses'),
  };
}

function render() {
  const s = snapshot();
  const lastRead = get('lastRead', null);
  const main = document.querySelector('main');

  const guide = document.createElement('section');
  guide.className = 'card guide-cta';
  guide.innerHTML = `
    <h2 style="margin:0 0 6px">How to learn</h2>
    <p class="muted" style="margin:0 0 12px">New to Arabic? The guide walks you through it in order —
    letters, vowels, first words, then reading. About 15 minutes a day.</p>
    <a class="btn" href="guide.html">Open the learning guide</a>`;

  const progress = document.createElement('section');
  progress.className = 'card';
  progress.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h2 style="margin:0">Your progress</h2>
      <a class="muted" href="progress.html">Details →</a>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${s.letters}/28</b><span class="muted">letters learned</span></div>
      <div class="stat"><b>${s.known}</b><span class="muted">words known</span></div>
      <div class="stat"><b>${s.due}</b><span class="muted">reviews due</span></div>
      <div class="stat"><b>${s.verses}</b><span class="muted">verses read</span></div>
    </div>
    <div class="row">
      ${
        s.due
          ? `<a class="btn" href="words.html#review">Review ${s.due} now</a>`
          : `<a class="btn btn-ghost" href="words.html#review">Review</a>`
      }
      <a class="btn btn-ghost" href="words.html#browse">Words</a>
      <a class="btn btn-ghost" href="letters.html">Letters</a>
    </div>
    ${
      lastRead
        ? `<p class="muted small" style="margin:12px 0 0">Continue reading:
           <a href="verses.html#${lastRead.s}:${lastRead.a}">Surah ${lastRead.s}, verse ${lastRead.a} →</a></p>`
        : `<p class="muted small" style="margin:12px 0 0">Start reading:
           <a href="verses.html#1:1">Al-Fatiha 1:1 →</a></p>`
    }`;

  const hero = main.querySelector('.hero');
  if (hero) {
    hero.after(guide);
    guide.after(progress);
  } else {
    main.prepend(progress);
    main.prepend(guide);
  }
}

render();
