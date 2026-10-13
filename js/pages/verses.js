// Verses module: surah browser → reading view.
//
//   • 114-surah browser with "continue where you left off"
//   • reading view: every word is tappable → hears the word-by-word clip and
//     shows transliteration + meaning (+ a grammar note where one exists)
//   • verse playback: ▶ on any verse plays FROM THAT VERSE (switching instantly,
//     backwards or forwards); the active verse shows ⏸ and toggles pause/resume;
//     ⟲ Restart verse replays the current verse from 0. Word-by-word mode has
//     the same switching rules.
//   • memorisation tracker: ✓ on any verse marks it memorised (self-reported);
//     the surah header shows "N memorised" and the Progress page lists them.
//   • translation toggle: Pickthall (default) / Sahih International / hidden
//   • deep links: verses.html#2:255 (opens, scrolls, flashes the verse), #112
//   • offline: a visited surah and played clips are cached by the service worker
import { loadData } from '../lib/data.js';
import { wbwFromRef, verseAudioUrl } from '../lib/audio.js';
import { play, stop } from '../ui/player.js';
import { mark, unmark, isLearned } from '../lib/progress.js';
import { get, set } from '../lib/store.js';
import { parseVerseRef, parseSurahRef, verseHash } from '../lib/hash.js';
import { toast } from '../ui/toast.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const IC_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';
const IC_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
const IC_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';

let surahIndex = null;
let reciters = [];
let notes = {};
let terms = [];
const surahCache = new Map();
let seq = null; // verse/word playback state { kind: 'ayah'|'words', ayah, paused, audio, stop() }
let view = null; // current surah view state { surah }
let followPaused = false; // manual scrolling suspends auto-scroll briefly
let followTimer = 0;

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
  updateRestart();
}

function setStatus(msg) {
  const el = main.querySelector('#play-status');
  if (el) el.textContent = msg;
}

// ---------- verse playback buttons ----------

function resetPlayButtons() {
  for (const b of main.querySelectorAll('.ay-play')) {
    b.innerHTML = IC_PLAY;
    b.classList.remove('on');
    b.setAttribute('aria-label', 'Play this verse');
  }
}

function setActive(n, playing) {
  resetPlayButtons();
  const b = main.querySelector(`.ay-play[data-a="${n}"]`);
  if (b) {
    b.classList.add('on');
    b.innerHTML = playing ? IC_PAUSE : IC_PLAY;
    b.setAttribute('aria-label', playing ? 'Pause' : 'Resume');
  }
}

function updateRestart() {
  const r = main.querySelector('#restart-verse');
  if (r) r.hidden = !seq;
}

// ---------- memorisation tracker ----------

function toggleMemo(a) {
  const { surah } = view;
  const key = `${surah.id}:${a}`;
  const was = isLearned('memorised', key);
  if (was) unmark('memorised', key);
  else mark('memorised', key);
  const btn = main.querySelector(`.ay-memo[data-a="${a}"]`);
  const card = document.getElementById(`ay-${surah.id}-${a}`);
  if (btn) {
    btn.classList.toggle('on', !was);
    btn.setAttribute('aria-pressed', String(!was));
  }
  if (card) card.classList.toggle('memo', !was);
  const chip = main.querySelector('#memo-count');
  if (chip) {
    const n = surah.ayahs.filter((x) => isLearned('memorised', `${surah.id}:${x.n}`)).length;
    chip.textContent = n ? ` · ${n} memorised` : '';
  }
  toast(was ? 'Removed from memorised' : 'Memorised ✓');
}

// Whole-surah memorisation: supersedes the per-verse buttons (they get disabled).
function toggleSurahMemo(id) {
  const key = String(id);
  const was = isLearned('surahs', key);
  if (was) unmark('surahs', key);
  else mark('surahs', key);
  toast(was ? 'Surah unmarked' : 'Surah memorised ✓');
  renderSurah(); // rebuild so buttons, chip and header all reflect the new state
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
        <a class="surah-row${isLearned('surahs', String(s.id)) ? ' memo' : ''}" href="#${s.id}">
          <span class="sr-num">${s.id}</span>
          <span>
            <span class="sr-name">${esc(s.name_simple)}${isLearned('surahs', String(s.id)) ? ' <span class="sr-done" title="Memorised">✓</span>' : ''}</span>
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

function ayahHTML(surah, ayah, surahDone = false) {
  const words = ayah.words
    .map(
      (w) =>
        `<span class="vw" data-s="${surah.id}" data-a="${ayah.n}" data-w="${w.n}" lang="ar">${esc(w.ar)}</span>`,
    )
    .join(' ');
  const tr = ayah.tr ? (prefs().tr === 'sahih' ? ayah.tr.sahih : ayah.tr.pickthall) : '';
  const trMode = prefs().tr === 'hidden' ? 'hidden' : 'shown';
  const memo = isLearned('memorised', `${surah.id}:${ayah.n}`);
  return `
    <article class="ayah${memo ? ' memo' : ''}" id="ay-${surah.id}-${ayah.n}" data-a="${ayah.n}" data-tr="${trMode}">
      <div class="ay-head">
        <span class="ay-num">${surah.id}:${ayah.n}</span>
        <span class="ay-actions">
          <button type="button" class="btn-icon ay-memo${memo ? ' on' : ''}" data-a="${ayah.n}" aria-label="${surahDone ? 'Surah marked memorised' : 'Mark as memorised'}" aria-pressed="${memo}"${surahDone ? ' disabled title="Surah marked memorised"' : ''}>${IC_CHECK}</button>
          <a class="btn-icon ay-prac" href="practice.html#read/${surah.id}:${ayah.n}" title="Practice this verse" aria-label="Practice this verse">🎤</a>
          <button type="button" class="btn-icon ay-play" data-a="${ayah.n}" aria-label="Play this verse">${IC_PLAY}</button>
        </span>
      </div>
      <p class="ay-text">${words}</p>
      ${tr ? `<p class="ay-tr">${esc(tr)}</p>` : ''}
      <div class="ay-extra" id="wx-${surah.id}-${ayah.n}" hidden></div>
    </article>`;
}

function renderSurah(focusAyah) {
  stopSeq();
  const { surah } = view;
  const meta = surahIndex.surahs.find((x) => x.id === surah.id);
  const p = prefs();
  const r = reciterObj();
  const keepScroll = window.scrollY;
  const memoCount = surah.ayahs.filter((a) => isLearned('memorised', `${surah.id}:${a.n}`)).length;
  const surahDone = isLearned('surahs', String(surah.id));

  main.innerHTML = `
    <div class="surah-head${surahDone ? ' memo' : ''}">
      <button type="button" class="btn btn-ghost" id="back">←</button>
      <div class="sh-titles">
        <div class="sh-name">${esc(surah.name_simple)} <span class="muted">${surah.id}</span></div>
        <div class="muted">${esc(meta ? meta.name_translit : '')} · ${surah.verses_count} verses
        <span class="memo-count" id="memo-count">${surahDone ? ' · surah memorised' : memoCount ? ` · ${memoCount} memorised` : ''}</span></div>
      </div>
      <span class="sh-ar" lang="ar" dir="rtl">${esc(surah.name_arabic)}</span>
    </div>

    <div class="verse-toolbar">
      <div class="row">
        <button type="button" class="btn" id="play-all">▶ Play surah</button>
        <button type="button" class="btn ${surahDone ? 'memo-on' : 'btn-ghost'}" id="surah-memo" aria-pressed="${surahDone}">${surahDone ? '✓ Surah memorised' : '✓ Memorise surah'}</button>
        <button type="button" class="btn btn-ghost" id="restart-verse" hidden>⟲ Restart verse</button>
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
      ${surah.ayahs.map((a) => ayahHTML(surah, a, surahDone)).join('')}
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
    followPaused = false;
    if (seq && !seq.paused) return pauseSeq();
    if (seq && seq.paused) return resumeSeq();
    startTeacher(1);
  });

  main.querySelector('#surah-memo').addEventListener('click', () => toggleSurahMemo(surah.id));

  main.querySelector('#restart-verse').addEventListener('click', () => {
    if (!seq) return;
    const a = seq.ayah;
    const kind = seq.kind;
    stopSeq();
    if (kind === 'words') playAyahWords(a);
    else startTeacher(a);
  });

  ayahsEl.addEventListener('click', (e) => {
    const vw = e.target.closest('.vw');
    if (vw) return wordTap(vw);
    const memoBtn = e.target.closest('.ay-memo');
    if (memoBtn) return toggleMemo(Number(memoBtn.dataset.a));
    const ap = e.target.closest('.ay-play');
    if (ap) return playFrom(Number(ap.dataset.a));
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
  if (!followPaused) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearAyahHighlights() {
  for (const prev of main.querySelectorAll('.ayah.playing')) prev.classList.remove('playing');
  resetPlayButtons();
}

function startTeacher(fromAyah) {
  stop();
  stopSeq();
  followPaused = false;
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
    setActive(ayah.n, true);
  };

  audio.addEventListener('ended', () => {
    i += 1;
    step();
  });

  seq = {
    kind: 'ayah',
    get ayah() {
      return list[Math.min(i, list.length - 1)].n;
    },
    paused: false,
    audio,
    statusText() {
      const ay = list[Math.min(i, list.length - 1)];
      return `Playing ${surah.id}:${ay.n} · ${reciterObj().label}`;
    },
    stop() {
      stopped = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
  updateRestart();
  step();
}

function pauseSeq() {
  if (!seq) return;
  seq.paused = true;
  if (seq.audio) seq.audio.pause();
  setActive(seq.ayah, false);
  const b = main.querySelector('#play-all');
  if (b) b.textContent = '▶ Resume';
  setStatus('Paused');
}

function resumeSeq() {
  if (!seq) return;
  seq.paused = false;
  if (seq.audio) seq.audio.play().catch(() => {});
  setActive(seq.ayah, true);
  const b = main.querySelector('#play-all');
  if (b) b.textContent = '⏸ Pause';
  setStatus(seq.statusText ? seq.statusText() : `Playing ${view.surah.id}:${seq.ayah} · ${reciterObj().label}`);
}

// word-by-word playback of one ayah
function playAyahWords(a) {
  stop();
  stopSeq();
  followPaused = false;
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
      clearAyahHighlights();
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
    setActive(a, true);
  };

  audio.addEventListener('ended', () => {
    i += 1;
    setTimeout(step, 350); // a small gap invites repeating aloud
  });

  seq = {
    kind: 'words',
    ayah: a,
    paused: false,
    audio,
    statusText() {
      const w = ayah.words[Math.min(i, ayah.words.length - 1)];
      return `${surah.id}:${a} — word ${Math.min(i + 1, ayah.words.length)}/${ayah.words.length}: ${w.gloss}`;
    },
    stop() {
      stopped = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
  updateRestart();
  step();
}

// ▶ on a verse: same verse → pause/resume · different verse → play from there.
function playFrom(a) {
  followPaused = false;
  if (prefs().wordMode) {
    if (seq && seq.kind === 'words' && seq.ayah === a) {
      return seq.paused ? resumeSeq() : pauseSeq();
    }
    return playAyahWords(a);
  }
  if (seq && seq.kind === 'ayah' && seq.ayah === a) {
    return seq.paused ? resumeSeq() : pauseSeq();
  }
  startTeacher(a);
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
  // Manual scrolling must not fight the auto-follow during playback:
  // suspend auto-scroll for a moment so you can move away and pick a verse.
  const noteManualScroll = () => {
    if (!seq) return;
    followPaused = true;
    clearTimeout(followTimer);
    followTimer = setTimeout(() => {
      followPaused = false;
    }, 8000);
  };
  window.addEventListener('wheel', noteManualScroll, { passive: true });
  window.addEventListener('touchmove', noteManualScroll, { passive: true });

  window.addEventListener('hashchange', route);
  route();
}

init();
