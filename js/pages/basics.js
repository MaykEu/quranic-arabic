// "How Arabic works" — three short explanations, placed where the writing
// system usually gets confusing: joining shapes, vowel marks, root patterns.
// Optional by design: nothing here is forced on the learner.
import { loadData } from '../lib/data.js';
import { buildIndex, joinPlan } from '../lib/shaping.js';
import { wbwFromRef } from '../lib/audio.js';
import { play } from '../ui/player.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FORM_LABEL = { isolated: 'alone', initial: 'start', medial: 'middle', final: 'end' };

const SOUND_TEXT = {
  a: 'sounds like “ba”',
  i: 'sounds like “bi”',
  u: 'sounds like “bu”',
  'no vowel': 'no vowel — the letter closes the syllable',
  'doubles the letter': 'the letter counts twice — “bb”',
  an: 'ends in “-an”',
  in: 'ends in “-in”',
  un: 'ends in “-un”',
};

// Letters for the tap-to-join demo (all base letters, all in letters.json).
const DEMO_LETTERS = ['ب', 'ت', 'ن', 'م', 'ك', 'ي', 'ا', 'و'];

// Root family ك-ت-ب (writing): same root, different vowel patterns.
// Audio refs are real word-by-word clips from the Qur'an (position-verified).
const FAMILY = [
  { ar: 'كُتِبَ', ref: 'wbw/002_178_004.mp3', translit: 'kutiba', en: 'it was written' },
  { ar: 'يَكْتُبُ', ref: 'wbw/004_081_014.mp3', translit: 'yaktubu', en: 'he writes' },
  { ar: 'كِتَابٌ', ref: 'wbw/002_089_003.mp3', translit: 'kitāb', en: 'a book' },
  { ar: 'كَاتِبٌ', ref: 'wbw/002_282_013.mp3', translit: 'kātib', en: 'a writer' },
];

async function init() {
  let letters = [];
  let harakat = [];
  try {
    [letters, harakat] = await Promise.all([loadData('letters.json'), loadData('harakat.json')]);
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load data: ${esc(e.message)}</p></section>`;
    return;
  }
  const index = buildIndex(letters);

  main.innerHTML = `
    <p class="muted">Three short explanations — read them now, or come back whenever something
    feels confusing. They explain what the rest of the app shows you.</p>

    <section class="card" id="join">
      <h3>1 · Letters join into a ribbon</h3>
      <p>Arabic runs right to left in one connected line. Most letters <strong>change shape</strong>
      depending on where they sit: alone, at the start, in the middle, or at the end of a join.
      The same letter ب:</p>
      <div class="forms-row">
        <div><span class="fr-glyph" lang="ar">ب</span><span class="fr-label">alone</span></div>
        <div><span class="fr-glyph" lang="ar">بـ</span><span class="fr-label">start</span></div>
        <div><span class="fr-glyph" lang="ar">ـبـ</span><span class="fr-label">middle</span></div>
        <div><span class="fr-glyph" lang="ar">ـب</span><span class="fr-label">end</span></div>
      </div>
      <p>Six letters never join the letter after them —
      <span class="ar" lang="ar" dir="rtl">ا د ذ ر ز و</span> — which is why words split
      into 2–3 pieces. Tap letters below and watch them change shape:</p>
      <div class="demo">
        <div class="demo-rack" id="rack">
          ${DEMO_LETTERS.map((ch) => `<button type="button" class="demo-key" lang="ar" dir="rtl">${ch}</button>`).join('')}
        </div>
        <div class="ribbon" id="ribbon" lang="ar" dir="rtl"><span class="muted empty" dir="ltr">tap a letter…</span></div>
        <div class="chip-row" id="forms"></div>
        <div class="row demo-actions">
          <button type="button" class="btn btn-ghost" id="undo">⌫ Undo</button>
          <button type="button" class="btn btn-ghost" id="clear">Clear</button>
        </div>
      </div>
    </section>

    <section class="card" id="marks">
      <h3>2 · The marks are the vowels</h3>
      <p>Letters carry <strong>consonants</strong>; the small marks above and below carry the
      <strong>vowels</strong>. Read the letter together with its mark as one sound:</p>
      <div class="mark-table">
        ${harakat
          .map(
            (h) => `
          <div class="mark-row">
            <span class="mr-glyph" lang="ar" dir="rtl">${h.display}</span>
            <span class="mr-name">${esc(h.name)}</span>
            <span class="muted">${esc(SOUND_TEXT[h.sound] || h.sound)}</span>
          </div>`,
          )
          .join('')}
      </div>
      <p>Long vowels — <span class="ar" lang="ar" dir="rtl">ا و ي</span> — stretch the sound:
      <span class="ar" lang="ar" dir="rtl">بَا</span> is “baa”,
      <span class="ar" lang="ar" dir="rtl">بِي</span> “bii”,
      <span class="ar" lang="ar" dir="rtl">بُو</span> “buu”.</p>
      <p class="muted">Without the marks you would have to guess the vowels — that is why the
      Qur’an prints them on every single letter.</p>
    </section>

    <section class="card" id="words">
      <h3>3 · How words are made</h3>
      <p>Most words grow from a <strong>root</strong> of three letters with a <strong>vowel
      pattern</strong>. Every word below uses the same root
      <span class="ar" lang="ar" dir="rtl">ك ت ب</span> (writing):</p>
      <div class="family-list" id="family">
        ${FAMILY.map(
          (f, i) => `
          <div class="family-row">
            <button type="button" class="btn btn-ghost fam-play" data-i="${i}" aria-label="Play ${esc(f.translit)}">▶</button>
            <span class="fam-ar" lang="ar" dir="rtl">${f.ar}</span>
            <span class="fam-text"><strong>${f.translit}</strong> — ${esc(f.en)}</span>
          </div>`,
        ).join('')}
      </div>
      <p>Same three letters, different pattern → different meaning. Once you recognise a root,
      you meet it again and again — that is why learning the 150 most frequent words pays off fast.</p>
      <p><a href="words.html#build">Try it: build words from letter tiles →</a></p>
    </section>`;

  // ---- tap-to-join demo ----
  const ribbon = main.querySelector('#ribbon');
  const formsRow = main.querySelector('#forms');
  let word = '';

  function renderDemo() {
    if (!word) {
      ribbon.innerHTML = '<span class="muted empty" dir="ltr">tap a letter…</span>';
      formsRow.innerHTML = '';
      return;
    }
    ribbon.textContent = word;
    const { plan } = joinPlan(word, index);
    formsRow.innerHTML = plan
      .map(
        (p) => `
      <span class="chip-form">
        <span class="cf-glyph" lang="ar" dir="rtl">${p.form || p.ch}</span>${p.formName ? FORM_LABEL[p.formName] : '?'}
      </span>`,
      )
      .join('');
  }

  const rack = main.querySelector('#rack');
  for (const b of rack.querySelectorAll('.demo-key')) {
    b.addEventListener('click', () => {
      if (word.length < 7) {
        word += b.textContent.trim();
        renderDemo();
      }
    });
  }
  main.querySelector('#undo').addEventListener('click', () => {
    word = word.slice(0, -1);
    renderDemo();
  });
  main.querySelector('#clear').addEventListener('click', () => {
    word = '';
    renderDemo();
  });
  renderDemo();

  // ---- root-family audio ----
  for (const b of main.querySelectorAll('.fam-play')) {
    b.addEventListener('click', () => {
      const f = FAMILY[Number(b.dataset.i)];
      play(wbwFromRef(f.ref), `${f.translit} — ${f.en}`);
    });
  }
}

init();
