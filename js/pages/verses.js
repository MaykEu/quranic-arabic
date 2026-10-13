// Verses module: surah browser → reading view.
//
//   • 114-surah browser with "continue where you left off"
//   • reading view: every word is tappable → hears the word-by-word clip and
//     shows transliteration + meaning (+ a grammar note where one exists)
//   • teacher mode: verse-by-verse recitation in one of 4 reciters, the current
//     ayah highlighted and auto-scrolled; word-by-word mode plays an ayah one
//     word at a time (segmenting)
//   • translation toggle: Pickthall (default) / Sahih International / hidden
//   • deep links: verses.html#2:255 (opens, scrolls, flashes the verse), #112
//   • offline: a visited surah and played clips are cached by the service worker
import { loadData } from '../lib/data.js';
import { wbwFromRef, verseAudioUrl } from '../lib/audio.js';
import { play, stop } from '../ui/player.js';
import { mark } from '../lib/progress.js';
import { get, set } from '../lib/store.js';
import { parseVerseRef, parseSurahRef, verseHash } from '../lib/hash.js';
import { toast } from '../ui/toast.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let surahIndex = null;
let reciters = [];
let notes = {};
let terms = [];
const surahCache = new Map();
let seq = null; // teacher-mode / word-by-word playback state
let view = null; // current surah view state { surah }

const prefs = () => {
  const p = get('prefs', {});
  return { tr: p.tr || 'pickthall', reciter: p.reciter || 'alafasy', wordMode: !!p.wordMode };
};
const savePref = (k, v) => set('prefs', { ...get('prefs', {}), [k]: v });
const reciterObj = () => reciters.find((r) => r.id === prefs().reciter) || reciters[0];

async function getSurah(id) {
  if (!surahCache.has(id)) {
    surahCache.set(id, await loadData(`quran/${String(id).padStart(3, '0')}.json`));
  }
  return surahCache.get(id);
}

function stopSeq() {
  if (!seq) return;
  seq.stop();
  seq = null;
}

function setStatus(msg) {
  const el = main.querySelector('#play-status');
  if (el) el.textContent = msg;
}

// ---------- routing ----------

async function route() {
  stopSeq();
  view = null;
  const h = location.hash.replace(/^#/, '');
  const vr = parseVerseRef(h);
  if (vr) return openSurah(vr.s, vr.a);
  const sr = parseSurahRef(h);
  if (sr) return openSurah(sr.s, null);
  return renderBrowser();
}

// ---------- surah browser ----------

function renderBrowser() {
  const last = get('lastRead', null);
  const lastSurah = last && surahIndex.surahs.find((s) => s.id === last.s);

  main.innerHTML = `
    <h2>Verses <span class="muted">· read &amp; listen</span></h2>
    ${
      lastSurah
        ? `<section class="card continue-card">
             <div class="row" style="justify-content:space-between;align-items:center">
               <div>
                 <strong>Continue</strong>
                 <div class="muted">${esc(lastSurah.name_simple)} ${esc(String(last.s))}:${esc(String(last.a))} — ${esc(lastSurah.name_translit)}</div>
               </div>
               <a class="btn" href="${verseHash(last.s, last.a)}">Open</a>
             </div>
           </section>`
        : ''
    }
    <p class="muted">Choose a surah. Tap any word while reading to hear it.</p>
    <div class="surah-list">
      ${surahIndex.surahs
        .map(
          (s) => `
        <a class="surah-row" href="#${s.id}">
          <span class="sr-num">${s.id}</span>
          <span>
            <span class="sr-name">${esc(s.name_simple)}</span>
            <span class="sr-meta">${esc(s.name_translit)} · ${s.verses_count} verses · ${esc(s.revelation_place)}</span>
          </span>
          <span class="sr-ar" lang="ar" dir="rtl">${esc(s.name_arabic)}</span>
        </a>`)
        .join('')}
    </div>`;
}

// ---------- reading view ----------

async function openSurah(s, focusAyah) {
  const meta = surahIndex.surahs.find((x) => x.id === s);
  if (!meta) return renderBrowser();

  main.innerHTML = `<p class="muted center" style="padding:32px">Loading ${esc(meta.name_simple)}…</p>`;
  let surah;
  try {
    surah = await getSurah(s);
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load this surah: ${esc(e.message)}</p><p class="muted">Check your connection — surahs are fetched once and then cached for offline use.</p></section>`;
    return;
  }
  if (!String(location.hash).includes(String(s))) return; // hash changed while loading

  view = { surah };
  set('lastRead', { s, a: focusAyah || 1, at: Date.now() });
  renderSurah(focusAyah);
}

function ayahHTML(surah, ayah) {
  const words = ayah.words
    .map(
      (w) =>
        `<span class="vw" data-s="${surah.id}" data-a="${ayah.n}" data-w="${w.n}" lang="ar">${esc(w.ar)}</span>`,
    )
    .join(' ');
  const tr = ayah.tr ? (prefs().tr === 'sahih' ? ayah.tr.sahih : ayah.tr.pickthall) : '';
  const trMode = prefs().tr === 'hidden' ? 'hidden' : 'shown';
  return `
    <article class="ayah" id="ay-${surah.id}-${ayah.n}" data-a="${ayah.n}" data-tr="${trMode}">
      <div class="ay-head">
        <span class="ay-num">${surah.id}:${ayah.n}</span>
        <span class="ay-actions">
          <a class="btn-icon ay-prac" href="practice.html#read/${surah.id}:${ayah.n}" title="Practice this verse" aria-label="Practice this verse">🎤</a>
          <button type="button" class="btn-icon ay-play" data-a="${ayah.n}" aria-label="Play this verse">▶</button>
        </span>
      </div>
      <p class="ay-text">${words}</p>
      ${tr ? `<p class="ay-tr">${esc(tr)}</p>` : ''}
      <div class="ay-extra" id="wx-${surah.id}-${ayah.n}" hidden></div>
    </article>`;
}

function renderSurah(focusAyah) {
  const { surah } = view;
  const meta = surahIndex.surahs.find((x) => x.id === surah.id);
  const p = prefs();
  const r = reciterObj();
  const keepScroll = window.scrollY;

  main.innerHTML = `
    <div class="surah-head">
      <button type="button" class="btn btn-ghost" id="back">←</button>
      <div class="sh-titles">
        <div class="sh-name">${esc(surah.name_simple)} <span class="muted">${surah.id}</span></div>
        <div class="muted">${esc(meta ? meta.name_translit : '')} · ${surah.verses_count} verses</div>
      </div>
      <span class="sh-ar" lang="ar" dir="rtl">${esc(surah.name_arabic)}</span>
    </div>

    <div class="verse-toolbar">
      <div class="row">
        <button type="button" class="btn" id="play-all">▶ Play surah</button>
        <select id="reciter" aria-label="Reciter">
          ${reciters.map((x) => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </div>
      <div class="row">
        <nav class="seg seg-tr" aria-label="Translation">
          <a href="#" data-tr="pickthall" class="${p.tr === 'pickthall' ? 'active' : ''}">Pickthall</a>
          <a href="#" data-tr="sahih" class="${p.tr === 'sahih' ? 'active' : ''}">Sahih Int'l</a>
          <a href="#" data-tr="hidden" class="${p.tr === 'hidden' ? 'active' : ''}">Hide</a>
        </nav>
        <button type="button" class="btn btn-ghost" id="wordmode" aria-pressed="${p.wordMode}">
          ${p.wordMode ? '☑' : '☐'} Word by word
        </button>
      </div>
      <p class="muted play-status" id="play-status">Tap a word to hear it · ▶ plays from that verse</p>
    </div>

    <div id="ayahs">
      ${surah.ayahs.map((a) => ayahHTML(surah, a)).join('')}
    </div>

    <details class="card">
      <summary><strong>Grammar glossary</strong> <span class="muted">· the 10 terms used in the notes</span></summary>
      <div class="gloss-list">
        ${terms
          .map(
            (t) =>
              `<div class="gloss-item"><span class="gloss-ar" lang="ar" dir="rtl">${esc(t.arabic)}</span><strong>${esc(t.term)}</strong> — ${esc(t.gist)}</div>`,
          )
          .join('')}
      </div>
    </details>`;

  const ayahsEl = main.querySelector('#ayahs');

  main.querySelector('#back').addEventListener('click', () => {
    location.hash = 'browse';
  });

  for (const link of main.querySelectorAll('.seg-tr a')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      savePref('tr', link.dataset.tr);
      renderSurah();
    });
  }

  main.querySelector('#reciter').addEventListener('change', (e) => {
    savePref('reciter', e.target.value);
    setStatus(`Reciter: ${reciterObj().label}`);
  });

  main.querySelector('#wordmode').addEventListener('click', () => {
    savePref('wordMode', !prefs().wordMode);
    renderSurah();
  });

  main.querySelector('#play-all').addEventListener('click', () => {
    if (seq && !seq.paused) return pauseSeq();
    if (seq && seq.paused) return resumeSeq();
    startTeacher(1);
  });

  ayahsEl.addEventListener('click', (e) => {
    const vw = e.target.closest('.vw');
    if (vw) return wordTap(vw);
    const ap = e.target.closest('.ay-play');
    if (ap) {
      if (prefs().wordMode) return playAyahWords(Number(ap.dataset.a));
      if (seq && !seq.paused) return pauseSeq();
      if (seq && seq.paused) return resumeSeq();
      startTeacher(Number(ap.dataset.a));
    }
  });

  if (focusAyah) {
    const el = ayahsEl.querySelector(`#ay-${surah.id}-${focusAyah}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1700);
    }
  } else {
    window.scrollTo({ top: keepScroll });
  }
}

// ---------- word interaction ----------

function highlightWord(el, ms = 900) {
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), ms);
}

function wordTap(el) {
  const { surah } = view;
  const a = Number(el.dataset.a);
  const n = Number(el.dataset.w);
  const ayah = surah.ayahs.find((x) => x.n === a);
  const w = ayah.words.find((x) => x.n === n);
  if (!w) return;

  stopSeq();
  play(wbwFromRef(w.audio), w.ar);
  highlightWord(el);

  const note = (notes[`${surah.id}:${a}`] || []).find((x) => x.n === n);
  const box = document.getElementById(`wx-${surah.id}-${a}`);
  for (const other of main.querySelectorAll('.ay-extra')) if (other !== box) other.hidden = true;
  box.hidden = false;
  box.innerHTML = `
    <div class="word-pop">
      <span class="wp-ar" lang="ar" dir="rtl">${esc(w.ar)}</span>
      <strong>${esc(w.translit)}</strong> — ${esc(w.gloss)}
      ${note ? `<div class="wp-note">💡 ${esc(note.note)}</div>` : ''}
    </div>`;

  mark('verses', `${surah.id}:${a}`);
  set('lastRead', { s: surah.id, a, at: Date.now() });
}

// ---------- playback ----------

function highlightAyah(n) {
  const el = document.getElementById(`ay-${view.surah.id}-${n}`);
  if (!el) return;
  for (const prev of main.querySelectorAll('.ayah.playing')) prev.classList.remove('playing');
  el.classList.add('playing');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearAyahHighlights() {
  for (const prev of main.querySelectorAll('.ayah.playing')) prev.classList.remove('playing');
}

function startTeacher(fromAyah) {
  stop();
  stopSeq();
  const { surah } = view;
  const list = surah.ayahs.filter((x) => x.n >= fromAyah);
  const audio = new Audio();
  let i = 0;
  let stopped = false;

  const finish = () => {
    stopSeq();
    clearAyahHighlights();
    setStatus('Finished. Tap a word to hear it · ▶ plays from that verse');
    const b = main.querySelector('#play-all');
    if (b) b.textContent = '▶ Play surah';
  };

  const step = () => {
    if (stopped) return;
    if (i >= list.length) return finish();
    const ayah = list[i];
    audio.src = verseAudioUrl(reciterObj(), ayah.global);
    audio.play().catch(() => {});
    highlightAyah(ayah.n);
    setStatus(`Playing ${surah.id}:${ayah.n} · ${reciterObj().label}`);
    const b = main.querySelector('#play-all');
    if (b) b.textContent = '⏸ Pause';
  };

  audio.addEventListener('ended', () => {
    i += 1;
    step();
  });

  seq = {
    audio,
    paused: false,
    stop() {
      stopped = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
  step();
}

function pauseSeq() {
  if (!seq) return;
  seq.paused = true;
  if (seq.audio) seq.audio.pause();
  const b = main.querySelector('#play-all');
  if (b) b.textContent = '▶ Resume';
  setStatus('Paused');
}

function resumeSeq() {
  if (!seq) return;
  seq.paused = false;
  if (seq.audio) seq.audio.play().catch(() => {});
  const b = main.querySelector('#play-all');
  if (b) b.textContent = '⏸ Pause';
}

// word-by-word playback of one ayah
function playAyahWords(a) {
  stop();
  stopSeq();
  const { surah } = view;
  const ayah = surah.ayahs.find((x) => x.n === a);
  const audio = new Audio();
  let i = 0;
  let stopped = false;
  const els = [...document.querySelectorAll(`.vw[data-a="${a}"]`)];

  const step = () => {
    if (stopped) return;
    if (i >= ayah.words.length) {
      stopSeq();
      setStatus('Word-by-word finished.');
      return;
    }
    const w = ayah.words[i];
    audio.src = wbwFromRef(w.audio);
    audio.play().catch(() => {});
    if (els[i]) highlightWord(els[i], 1200);
    setStatus(`${surah.id}:${a} — word ${i + 1}/${ayah.words.length}: ${w.gloss}`);
    const b = main.querySelector('#play-all');
    if (b) b.textContent = '⏸ Pause';
  };

  audio.addEventListener('ended', () => {
    i += 1;
    setTimeout(step, 350); // a small gap invites repeating aloud
  });

  seq = {
    audio,
    paused: false,
    stop() {
      stopped = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
  step();
}

// ---------- boot ----------

async function init() {
  try {
    const [idx, recs, nts, tms] = await Promise.all([
      loadData('quran/index.json'),
      loadData('reciters.json'),
      loadData('verse-notes.json'),
      loadData('grammar-terms.json'),
    ]);
    surahIndex = idx;
    reciters = recs;
    notes = nts;
    terms = tms;
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load Quran data: ${esc(e.message)}</p></section>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
