// Word roots page: curated root families from the words you're learning.
// Every member is a real corpus word (spelling, gloss, transliteration and
// audio pinned to a verified verse occurrence — see tools/build-roots.mjs).
import { loadData } from '../lib/data.js';
import { wbwFromRef } from '../lib/audio.js';
import { play } from '../ui/player.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Same normalization as the data pipeline: strip harakat so typed searches
// ("كتب") match diacritized words ("كِتَابِ") and the spaced root ("ك ت ب").
const strip = (s) => String(s).replace(/[\u0610-\u061A\u064B-\u065F\u0670\u0671\u06D6-\u06ED\u0640]/g, '');

let roots = [];

const card = (f) => `
  <section class="card root-card" data-search="${esc(
    [strip(f.root), strip(f.root).replace(/\s+/g, ''), f.note, ...f.members.map((m) => `${strip(m.ar)} ${m.translit} ${m.gloss}`)]
      .join(' ')
      .toLowerCase(),
  )}">
    <div class="root-head">
      <span class="root-letters" lang="ar" dir="rtl">${esc(f.root)}</span>
      <span class="muted">${esc(f.note)}</span>
    </div>
    <div class="family-list">
      ${f.members
        .map(
          (m, i) => `
        <div class="family-row">
          <button type="button" class="btn btn-ghost fam-play" data-f="${esc(f.id)}" data-i="${i}" aria-label="Play ${esc(m.translit)}">▶</button>
          <span class="fam-ar" lang="ar" dir="rtl">${esc(m.ar)}</span>
          <span class="fam-text"><strong>${esc(m.translit)}</strong> — ${esc(m.gloss)}
          <span class="muted root-ref">${esc(m.ref)}</span></span>
        </div>`,
        )
        .join('')}
    </div>
  </section>`;

async function init() {
  let data;
  try {
    data = await loadData('roots.json');
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load roots: ${esc(e.message)}</p></section>`;
    return;
  }
  roots = data.roots;

  main.innerHTML = `
    <p class="muted">Most Arabic words grow from a three-letter <strong>root</strong> with a vowel
    pattern. Here are ${roots.length} roots from the words you're learning — tap any word to hear it.
    <a href="basics.html#words">Why roots matter →</a></p>
    <input type="search" id="root-filter" class="root-filter" placeholder="Filter — English or عربي" aria-label="Filter roots">
    <div id="root-list">${roots.map(card).join('')}</div>`;

  for (const b of main.querySelectorAll('.fam-play')) {
    b.addEventListener('click', () => {
      const f = roots.find((x) => x.id === b.dataset.f);
      const m = f && f.members[Number(b.dataset.i)];
      if (m) play(wbwFromRef(m.audio), `${m.translit} — ${m.gloss}`);
    });
  }

  const filter = main.querySelector('#root-filter');
  filter.addEventListener('input', () => {
    const q = strip(filter.value.trim().toLowerCase());
    for (const c of main.querySelectorAll('.root-card')) {
      c.classList.toggle('hidden', q !== '' && !c.dataset.search.includes(q));
    }
  });
}

init();
