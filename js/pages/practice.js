// Practice module — five drills:
//   Read aloud : record yourself, then hear the reciter's verse back-to-back
//                (production effect; deliberately NO automatic scoring)
//   Trace      : trace whole words with the same coverage scorer as letters
//   Listen     : hear → say → next with a daily counter
//   Quiz       : hear a word, pick it from four (ear training; feeds the SRS)
//   Recall     : verse shown, meaning hidden, self-grade → same SRS scheduler
// Modes live in the hash (#read / #trace / #listen / #quiz / #recall), and
// Read aloud / Recall accept a verse: #read/2:255, #recall/2:255. Read aloud
// walks ayah by ayah from the chosen verse. Everything is optional — any
// level can jump anywhere.
import { loadData } from '../lib/data.js';
import { wbwFromRef, verseAudioUrl } from '../lib/audio.js';
import { play } from '../ui/player.js';
import { get, set } from '../lib/store.js';
import { load as loadSRS, review, dueIds } from '../lib/srs.js';
import { mountTrace } from '../ui/trace.js';
import { openVersePicker } from '../ui/verse-picker.js';
import { parsePracticeHash } from '../lib/hash.js';
import { pickOptions, buildRound, glossOptions, buildDrillPools } from '../lib/quiz.js';
import { toast } from '../ui/toast.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MODES = [
  ['read', 'Read aloud'],
  ['trace', 'Trace'],
  ['listen', 'Listen'],
  ['quiz', 'Quiz'],
  ['recall', 'Recall'],
];

const DEFAULT_VERSES = ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7', '2:255', '112:1', '112:2', '103:1', '114:1'];
const QUIZ_ROUND = 10;

const state = {
  index: null,
  reciters: [],
  build: [],
  tracePool: [],
  listenPool: [],
  vocab: [],
  surahs: new Map(),
  rec: { recorder: null, chunks: [], url: null, stream: null, verse: null },
  traceIdx: 0,
  listenIdx: 0,
  read: null, // { s, a } — chosen verse for Read aloud
  recall: { queue: [], i: 0, revealed: false, got: 0, single: false, focus: null },
  sound: { byMode: {} }, // per-mode quiz rounds: { read: {...}, meaning: {...} }
};

const prefs = () => get('prefs', {});
// Local day (YYYY-MM-DD) — the listen counter must reset at the learner's midnight,
// not UTC midnight.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const savePractice = (patchObj) => set('practice', { ...get('practice', {}), ...patchObj });

// Listen drill counter: { listens: { 'YYYY-MM-DD': n } } — a per-day map so cloud
// sync can merge it per day (the old {day, count} shape got mangled by the merge).
function listensMap(p = get('practice', {})) {
  const out = { ...(p.listens && typeof p.listens === 'object' ? p.listens : {}) };
  if (p.day && typeof p.count === 'number') out[p.day] = Math.max(out[p.day] || 0, p.count); // absorb the legacy shape
  return out;
}
const listenCount = () => listensMap()[today()] || 0;
function listenAdd() {
  const p = get('practice', {});
  const listens = listensMap(p);
  listens[today()] = (listens[today()] || 0) + 1;
  const { day, count, ...rest } = p; // drop the legacy fields for good
  set('practice', { ...rest, listens });
}

function loadSelection() {
  const p = get('practice', {});
  if (p.readVerse) state.read = p.readVerse;
  state.recall.single = !!p.recallSingle;
  state.recall.focus = p.recallVerse || null;
}

async function getSurah(id) {
  if (!state.surahs.has(id)) {
    state.surahs.set(id, await loadData(`quran/${String(id).padStart(3, '0')}.json`));
  }
  return state.surahs.get(id);
}
async function getVerse(s, a) {
  const surah = await getSurah(s);
  const ayah = surah.ayahs.find((x) => x.n === a);
  const meta = state.index.surahs.find((x) => x.id === s);
  return ayah && meta ? { surah: meta, ayah } : null;
}

function recentVerses() {
  const p = get('progress', {});
  const entries = Object.entries(p.verses || {})
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .map(([id]) => id)
    .filter((id) => /^\d+:\d+$/.test(id));
  return entries.length ? entries.slice(0, 12) : DEFAULT_VERSES;
}

function stopRecording() {
  const r = state.rec;
  if (r.recorder && r.recorder.state === 'recording') {
    try {
      r.recorder.stop();
    } catch {
      /* already stopped */
    }
  }
  if (r.stream) r.stream.getTracks().forEach((t) => t.stop());
  r.stream = null;
  r.recorder = null;
}

// ---------- shell ----------

function shell(mode, body) {
  main.innerHTML = `
    <h2>Practice</h2>
    <nav class="seg" aria-label="Practice modes">
      ${MODES.map(([m, label]) => `<a href="#${m}" class="${m === mode ? 'active' : ''}">${label}</a>`).join('')}
    </nav>
    <div id="view">${body}</div>`;
}

// ---------- read aloud ----------

async function renderRead() {
  shell('read', `<section class="card pr-card"><p class="muted">Loading…</p></section>`);
  const pool = recentVerses();
  const sel = state.read;
  const key = sel ? `${sel.s}:${sel.a}` : state.rec.verse || pool[0];
  const [s, a] = key.split(':').map(Number);
  const v = await getVerse(s, a);
  const reciter = state.reciters.find((r) => r.id === prefs().reciter) || state.reciters[0];
  const tr = v.ayah.tr ? (prefs().tr === 'sahih' ? v.ayah.tr.sahih : v.ayah.tr.pickthall) : '';

  document.getElementById('view').innerHTML = `
    <section class="card pr-card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
        <div class="muted">${esc(v.surah.name_simple)} ${s}:${a} — ${esc(v.surah.name_translit)}</div>
        <button type="button" class="btn btn-ghost" id="choose">Choose verse</button>
      </div>
      <p class="pr-verse" lang="ar" dir="rtl">${esc(v.ayah.text)}</p>
      ${tr ? `<p class="pr-tr">${esc(tr)}</p>` : ''}
      <div class="rec-row" id="rec-row"></div>
      <p class="pr-note">Listen to the reciter first, then read aloud and compare.
      No scoring — your ears decide. (Recording stays on your device.)</p>
      <div id="mic-note" class="pr-note"></div>
      <div class="row">
        <button type="button" class="btn btn-ghost" id="nextv">Next verse →</button>
      </div>
    </section>`;

  const row = document.getElementById('rec-row');

  const renderRow = () => {
    const r = state.rec;
    const recording = r.recorder && r.recorder.state === 'recording';
    row.innerHTML = `
      ${
        recording
          ? `<button type="button" class="btn" id="stop"><span class="rec-dot"></span>Stop</button>`
          : `<button type="button" class="btn" id="record">🎤 Record</button>`
      }
      <button type="button" class="btn btn-ghost" id="theirs">▶ Reciter</button>
      ${r.url ? `<button type="button" class="btn btn-ghost" id="mine">▶ You</button>` : ''}`;
    const rec = row.querySelector('#record');
    if (rec) rec.addEventListener('click', startRec);
    const st = row.querySelector('#stop');
    if (st) st.addEventListener('click', () => state.rec.recorder.stop());
    row.querySelector('#theirs').addEventListener('click', () =>
      play(verseAudioUrl(reciter, v.ayah.global), `${s}:${a} — ${reciter.label}`),
    );
    const mine = row.querySelector('#mine');
    if (mine) mine.addEventListener('click', () => play(state.rec.url, 'You'));
  };

  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      document.getElementById('mic-note').textContent =
        'Recording is not supported in this browser — you can still read aloud without it.';
      return;
    }
    try {
      state.rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      document.getElementById('mic-note').textContent =
        'Microphone access was blocked. Allow it in your browser settings to record.';
      return;
    }
    const r = state.rec;
    r.chunks = [];
    if (r.url) URL.revokeObjectURL(r.url);
    r.url = null;
    r.recorder = new MediaRecorder(r.stream);
    r.recorder.ondataavailable = (e) => r.chunks.push(e.data);
    r.recorder.onstop = () => {
      r.stream?.getTracks().forEach((t) => t.stop());
      r.stream = null;
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      r.url = URL.createObjectURL(blob);
      renderRow();
    };
    r.recorder.start();
    renderRow();
  }

  renderRow();

  document.getElementById('choose').addEventListener('click', () =>
    openVersePicker({
      onPick: (cs, ca) => {
        state.read = { s: cs, a: ca };
        savePractice({ readVerse: state.read });
        stopRecording();
        renderRead();
      },
    }),
  );

  document.getElementById('nextv').addEventListener('click', () => {
    stopRecording();
    let cs = s;
    let ca = a + 1;
    if (ca > v.surah.verses_count) {
      cs = cs === 114 ? 1 : cs + 1;
      ca = 1;
    }
    state.read = { s: cs, a: ca };
    state.rec.verse = `${cs}:${ca}`;
    savePractice({ readVerse: state.read });
    renderRead();
  });
}

// ---------- trace ----------

function renderTrace() {
  const w = state.tracePool[state.traceIdx % state.tracePool.length];
  shell('trace', `
    <section class="card pr-card">
      <p class="muted center">Trace the word's letter skeleton — the full vowelled form is shown below.</p>
      <div id="trace-slot"></div>
      <div class="trace-caption">
        <div class="trace-word-ar" lang="ar" dir="rtl">${esc(w.ar)}</div>
        <div class="muted">${esc(w.translit)} — ${esc(w.gloss)}</div>
      </div>
      <div class="trace-actions">
        <button type="button" class="btn" id="check">Check</button>
        <button type="button" class="btn btn-ghost" id="erase">Erase</button>
        <button type="button" class="btn btn-ghost" id="nextw">Next word →</button>
      </div>
      <p class="center muted" id="trace-msg">Trace the dashed word — stay on the line, dots included.</p>
    </section>`);

  const trace = mountTrace(document.getElementById('trace-slot'), w.bare);
  document.getElementById('erase').addEventListener('click', () => trace.clear());
  document.getElementById('check').addEventListener('click', () => {
    const { coverage, precision, missedParts, ok } = trace.checkCoverage();
    const msg = document.getElementById('trace-msg');
    const pct = Math.round(coverage * 100);
    if (ok) {
      msg.textContent = `Nice — ${pct}% covered.`;
      toast(`${w.bare} traced`);
      setTimeout(() => {
        state.traceIdx += 1;
        renderTrace();
      }, 800);
    } else if (missedParts > 0) {
      msg.textContent = 'Some parts are missing — check the dots and trace every stroke of the word.';
    } else if (precision < 0.88) {
      msg.textContent = 'Too much of your ink is off the dashed line — follow it exactly (don\u2019t fill or scribble).';
    } else {
      msg.textContent = `Almost — ${pct}% covered. Close the gaps and check again.`;
    }
  });
  document.getElementById('nextw').addEventListener('click', () => {
    state.traceIdx += 1;
    renderTrace();
  });
}

// ---------- listen ----------

function renderListen() {
  const w = state.listenPool[state.listenIdx % state.listenPool.length];
  const count = listenCount();

  shell('listen', `
    <section class="card pr-card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="muted">Hear it → say it → next</span>
        <span class="counter-chip" id="count">${count} today</span>
      </div>
      <div class="listen-word" lang="ar" dir="rtl">${esc(w.ar)}</div>
      <p class="center muted">${esc(w.translit)} — ${esc(w.gloss)}</p>
      <div class="row" style="justify-content:center">
        <button type="button" class="btn" id="hear">🔊 Hear it</button>
        <button type="button" class="btn btn-ghost" id="next">I said it — next →</button>
      </div>
      <p class="pr-note center">Press “Hear it”, say the word out loud, then move on.</p>
    </section>`);

  const playCur = () => play(wbwFromRef(w.audio), w.bare);

  document.getElementById('hear').addEventListener('click', (e) => {
    playCur();
    e.currentTarget.textContent = '🔊 Hear it again';
  });
  document.getElementById('next').addEventListener('click', () => {
    listenAdd();
    state.listenIdx += 1;
    renderListen();
  });
}

// ---------- quiz (ear training) ----------

const QUIZ_MODES = { read: 'Read it', meaning: 'Understand it' };
const freshSound = () => ({
  round: [],
  i: 0,
  got: 0,
  answered: false,
  log: [],
  missed: [],
  options: null,
  optionsFor: -1,
});

function quizSeg(mode) {
  return `<nav class="seg quiz-seg" aria-label="Quiz type">
    <a href="#" data-qmode="read" class="${mode === 'read' ? 'active' : ''}">Read it</a>
    <a href="#" data-qmode="meaning" class="${mode === 'meaning' ? 'active' : ''}">Understand it</a>
  </nav>`;
}

function wireQuizSeg(mode) {
  for (const link of main.querySelectorAll('.quiz-seg [data-qmode]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (link.dataset.qmode === mode) return;
      set('prefs', { ...get('prefs', {}), quizMode: link.dataset.qmode });
      renderQuiz();
    });
  }
}

function renderQuiz() {
  const mode = prefs().quizMode === 'meaning' ? 'meaning' : 'read';
  if (!state.sound.byMode) state.sound.byMode = {};
  const s = (state.sound.byMode[mode] = state.sound.byMode[mode] || freshSound());
  if (!s.round.length) {
    s.round = buildRound(state.vocab, QUIZ_ROUND);
    s.i = 0;
    s.got = 0;
    s.log = [];
    s.missed = [];
  }
  if (!s.round.length) {
    shell('quiz', `<section class="card"><p class="muted">No words loaded yet.</p></section>`);
    return;
  }
  if (s.i >= s.round.length) return renderQuizDone(s, mode);

  const w = s.round[s.i];
  s.answered = false;
  // Options are built once per question (a re-render must never reshuffle them).
  // They are visible from the start — the sound is the only thing you must ask for.
  if (s.optionsFor !== s.i) {
    s.options = mode === 'meaning' ? glossOptions(w, state.vocab, 4) : pickOptions(w, state.vocab, 4);
    s.optionsFor = s.i;
    if (!s.options) {
      s.i += 1; // no clean distractors for this word — skip it
      return renderQuiz();
    }
  }

  const segBar = quizSeg(mode);
  const dots =
    (s.log || []).map((ok) => `<span class="q-dot ${ok ? 'good' : 'bad'}"></span>`).join('') +
    `<span class="q-dot now"></span>`;

  shell('quiz', `
    ${segBar}
    <section class="card pr-card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="q-dots" aria-label="Round progress">${dots}</span>
        <span class="counter-chip">${s.i + 1} / ${s.round.length}</span>
      </div>
      <div class="row" style="justify-content:center;margin:10px 0">
        <button type="button" class="btn" id="replay">🔊 Hear the word</button>
      </div>
      <div class="sound-grid" id="options">
        ${s.options
          .map((o) =>
            mode === 'meaning'
              ? `<button type="button" class="sound-opt gloss-opt" data-rank="${o.rank}">${esc(o.gloss)}</button>`
              : `<button type="button" class="sound-opt" data-rank="${o.rank}" lang="ar" dir="rtl">${esc(o.ar)}</button>`,
          )
          .join('')}
      </div>
      <p class="muted center" id="sound-feedback">&nbsp;</p>
    </section>`);

  const playCur = () => play(wbwFromRef(w.audio), 'Hear the word');
  document.getElementById('replay').addEventListener('click', playCur);

  wireQuizSeg(mode);

  const fb = document.getElementById('sound-feedback');
  for (const btn of main.querySelectorAll('.sound-opt')) {
    btn.addEventListener('click', () => {
      if (s.answered) return;
      s.answered = true;
      const correct = Number(btn.dataset.rank) === w.rank;
      review(String(w.rank), correct);
      s.log = [...(s.log || []), correct];
      if (correct) s.got += 1;
      else s.missed = [...(s.missed || []), w];
      for (const b of main.querySelectorAll('.sound-opt')) {
        if (Number(b.dataset.rank) === w.rank) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
        b.disabled = true;
      }
      const dotsNow = main.querySelector('.q-dots');
      if (dotsNow) {
        const cur = dotsNow.querySelector('.q-dot.now');
        if (cur) {
          cur.classList.remove('now');
          cur.classList.add(correct ? 'good' : 'bad');
          cur.insertAdjacentHTML('afterend', '<span class="q-dot now"></span>');
        }
      }
      fb.innerHTML = `${correct ? '✓' : '✗ It was'} <span lang="ar" dir="rtl">${esc(w.ar)}</span> — ${esc(w.translit)} · ${esc(w.gloss)}`;
      setTimeout(
        () => {
          s.i += 1;
          s.optionsFor = -1;
          renderQuiz();
        },
        correct ? 1000 : 1900,
      );
    });
  }
}

function renderQuizDone(s, mode) {
  const missed = s.missed || [];
  shell('quiz', `
    ${quizSeg(mode)}
    <section class="card center">
      <h2>Round done</h2>
      <p>${QUIZ_MODES[mode]} · ${s.got} of ${s.round.length} correct.</p>
      ${
        missed.length
          ? `<p class="muted">Missed words come back first in review. Tap one to hear it again:</p>
             <div class="q-missed">
               ${missed
                 .map(
                   (w) =>
                     `<button type="button" class="q-miss-row" data-rank="${w.rank}"><span lang="ar" dir="rtl">${esc(w.ar)}</span><span class="muted">${esc(w.translit)} — ${esc(w.gloss)}</span></button>`,
                 )
                 .join('')}
             </div>`
          : '<p class="muted">No misses — clean round.</p>'
      }
      <div class="row" style="justify-content:center">
        <button type="button" class="btn" id="again">Another round</button>
      </div>
    </section>`);
  for (const b of main.querySelectorAll('.q-miss-row')) {
    b.addEventListener('click', () => {
      const w = state.vocab.find((x) => String(x.rank) === b.dataset.rank);
      if (w) play(wbwFromRef(w.audio), 'Missed word');
    });
  }
  wireQuizSeg(mode);
  document.getElementById('again').addEventListener('click', () => {
    state.sound.byMode[mode] = freshSound(); // only this quiz restarts
    renderQuiz();
  });
}

// ---------- recall ----------

function buildRecallQueue() {
  const srsAll = loadSRS();
  const due = dueIds(srsAll).filter((id) => /^v:\d+:\d+$/.test(id));
  if (state.recall.single && state.recall.focus) {
    return [`${state.recall.focus.s}:${state.recall.focus.a}`];
  }
  const pool = recentVerses();
  const fresh = pool.filter((id) => !srsAll[`v:${id}`]);
  return [...due.map((id) => id.slice(2)), ...fresh].slice(0, 8);
}

async function renderRecall() {
  const segBar = `
    <nav class="seg" aria-label="Recall source" style="margin:0 0 12px">
      <a href="#" data-src="auto" class="${state.recall.single ? '' : 'active'}">My verses</a>
      <a href="#" data-src="one" class="${state.recall.single ? 'active' : ''}">One verse</a>
    </nav>`;

  // One-verse mode with nothing chosen yet: ask — never auto-open the picker.
  if (state.recall.single && !state.recall.focus) {
    shell('recall', `
      ${segBar}
      <section class="card center">
        <h2>One verse</h2>
        <p class="muted">Drill a single verse on its own. Nothing is chosen yet.</p>
        <div class="row" style="justify-content:center">
          <button type="button" class="btn" id="choose">Choose a verse</button>
        </div>
      </section>`);
    document.getElementById('choose').addEventListener('click', openRecallPicker);
    wireRecallSeg();
    return;
  }

  if (!state.recall.queue.length) {
    state.recall = { ...state.recall, queue: buildRecallQueue(), i: 0, revealed: false, got: 0 };
  }
  const r = state.recall;

  if (r.i >= r.queue.length) {
    shell('recall', `
      ${segBar}
      <section class="card center">
        <h2>Recall done</h2>
        <p>${r.got} of ${r.queue.length} recalled. Misses come back first next time.</p>
        <div class="row" style="justify-content:center"><button type="button" class="btn" id="again">Again</button></div>
      </section>`);
    document.getElementById('again').addEventListener('click', () => {
      state.recall = { ...state.recall, queue: buildRecallQueue(), i: 0, revealed: false, got: 0 };
      renderRecall();
    });
    wireRecallSeg();
    return;
  }

  const [s, a] = r.queue[r.i].split(':').map(Number);
  const v = await getVerse(s, a);
  if (!v) {
    r.i += 1;
    return renderRecall();
  }
  const tr = v.ayah.tr ? (prefs().tr === 'sahih' ? v.ayah.tr.sahih : v.ayah.tr.pickthall) : '';

  shell('recall', `
    ${segBar}
    <section class="card pr-card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
        <p class="muted" style="margin:0">${r.i + 1} / ${r.queue.length} · ${esc(v.surah.name_simple)} ${s}:${a}</p>
        ${r.single ? `<button type="button" class="btn btn-ghost" id="choose">Choose verse</button>` : ''}
      </div>
      <p class="recall-verse" lang="ar" dir="rtl">${esc(v.ayah.text)}</p>
      <div id="reveal-box" hidden>
        ${tr ? `<p class="pr-tr">${esc(tr)}</p>` : ''}
      </div>
      <div class="row" style="justify-content:center">
        <button type="button" class="btn" id="show">Show meaning</button>
      </div>
      <div class="row" style="justify-content:center" id="grade-row" hidden>
        <button type="button" class="btn btn-ghost" id="again">Again</button>
        <button type="button" class="btn" id="got">Got it</button>
      </div>
      <p class="pr-note center">Read the verse aloud before revealing the meaning.</p>
    </section>`);

  document.getElementById('show').addEventListener('click', () => {
    document.getElementById('reveal-box').hidden = false;
    document.getElementById('grade-row').hidden = false;
    document.getElementById('show').hidden = true;
  });
  const grade = (good) => {
    review(`v:${s}:${a}`, good);
    if (good) r.got += 1;
    r.i += 1;
    renderRecall();
  };
  document.getElementById('again').addEventListener('click', () => grade(false));
  document.getElementById('got').addEventListener('click', () => grade(true));

  const choose = document.getElementById('choose');
  if (choose) choose.addEventListener('click', openRecallPicker);
  wireRecallSeg();
}

// Choosing a verse is always an explicit step (never triggered by switching tabs).
function openRecallPicker() {
  openVersePicker({
    onPick: (cs, ca) => {
      state.recall.focus = { s: cs, a: ca };
      state.recall = { ...state.recall, queue: [], i: 0, revealed: false, got: 0 };
      savePractice({ recallVerse: state.recall.focus, recallSingle: true });
      renderRecall();
    },
  });
}

function wireRecallSeg() {
  for (const link of main.querySelectorAll('.seg [data-src]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const one = link.dataset.src === 'one';
      if (!!state.recall.single === one) return;
      // Switching tabs only switches tabs — the picker opens from "Choose a verse".
      state.recall = { ...state.recall, single: one, queue: [], i: 0, revealed: false, got: 0 };
      savePractice({ recallSingle: one });
      renderRecall();
    });
  }
}

// ---------- router ----------

function render() {
  stopRecording();
  const route = parsePracticeHash(location.hash);
  if (route.s && route.a) {
    if (route.mode === 'recall') {
      state.recall.single = true;
      state.recall.focus = { s: route.s, a: route.a };
      state.recall.queue = [];
      savePractice({ recallSingle: true, recallVerse: state.recall.focus });
    } else {
      state.read = { s: route.s, a: route.a };
      savePractice({ readVerse: state.read });
    }
  }
  if (route.mode === 'trace') return renderTrace();
  if (route.mode === 'listen') return renderListen();
  if (route.mode === 'quiz') return renderQuiz();
  if (route.mode === 'recall') return renderRecall();
  return renderRead();
}

async function init() {
  try {
    const [idx, recs, build, vocab] = await Promise.all([
      loadData('quran/index.json'),
      loadData('reciters.json'),
      loadData('build-words.json'),
      loadData('vocabulary.json'),
    ]);
    state.index = idx;
    state.reciters = recs;
    state.build = build.words;
    state.vocab = vocab.words;
    const pools = buildDrillPools(build.words, vocab.words);
    state.tracePool = pools.trace;
    state.listenPool = pools.listen;
    loadSelection();
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load practice data: ${esc(e.message)}</p></section>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

init();
