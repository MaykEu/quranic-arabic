// Letters module.
//
//   Browse — the 28-letter grid (shaded by how solid each letter is in review),
//            letter detail (four forms + sound + audio) and guided tracing.
//   Quiz   — Letters (hear the name → pick the glyph) · Forms (a positional form
//            → which letter is it?) · Vowels (a mark → which harakah is it?).
//   Recall — Say it (see the glyph → say the sound + name aloud → self-grade) ·
//            Trace it (hear the name → write it from memory, then compare).
//
// Letters and vowels are scheduled with the SAME spaced-repetition boxes as
// words (1·3·7·14·30 days) under their own id spaces ('L:' / 'M:'), so they turn
// up in the due counts, the daily goal and the Progress drills like everything
// else. Drill design: distractors come from the letter's confusable family
// (data/letter-groups.json), so a choice is always between look-alikes — that
// discrimination is the skill reading actually demands.
import { loadData } from '../lib/data.js';
import { play } from '../ui/player.js';
import { toast } from '../ui/toast.js';
import { mountTrace } from '../ui/trace.js';
import { mark, unmark, isLearned, count } from '../lib/progress.js';
import { load as loadSRS, review, dueIds } from '../lib/srs.js';
import { letterOptions, formQuestion, vowelOptions, letterRound, letterKey, vowelKey } from '../lib/letters-drill.js';
import { graded } from '../lib/activity.js';
import { get, set } from '../lib/store.js';

const main = document.querySelector('main');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';

let letters = [];
let harakat = [];
let groups = [];

const ROUND = 10;
const TABS = [
  ['browse', 'Browse'],
  ['quiz', 'Quiz'],
  ['recall', 'Recall'],
];
const QUIZ_MODES = [
  ['letters', 'Letters'],
  ['forms', 'Forms'],
  ['vowels', 'Vowels'],
];
const RECALL_MODES = [
  ['say', 'Say it'],
  ['trace', 'Trace it'],
];

const prefs = () => get('prefs', {});
// The hash carries the drill: `#quiz/vowels`, `#recall/trace`. Without it the
// last-used mode is remembered (prefs), so plain `#quiz` still returns you to
// where you were.
const hashMode = () => location.hash.replace(/^#/, '').split('/')[1] || '';
const quizMode = () => {
  const m = hashMode();
  if (QUIZ_MODES.some(([id]) => id === m)) return m;
  return QUIZ_MODES.some(([id]) => id === prefs().letterQuiz) ? prefs().letterQuiz : 'letters';
};
const recallMode = () => {
  const m = hashMode();
  if (RECALL_MODES.some(([id]) => id === m)) return m;
  return prefs().letterRecall === 'trace' ? 'trace' : 'say';
};

const tabFromHash = () => {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('quiz')) return 'quiz';
  if (h.startsWith('recall')) return 'recall';
  return 'browse';
};

const tabBar = (tab) => `<nav class="seg" aria-label="Letters sections">
  ${TABS.map(([id, label]) => `<a href="#${id}" class="${id === tab ? 'active' : ''}">${label}</a>`).join('')}
</nav>`;

const subSeg = (items, active, attr) => `<nav class="seg" aria-label="Drill type">
  ${items.map(([id, label]) => `<a href="#" data-${attr}="${id}" class="${id === active ? 'active' : ''}">${label}</a>`).join('')}
</nav>`;

// ---------- letter strength (from the SRS boxes) ----------

const boxOf = (id) => (loadSRS()[letterKey(id)] || {}).box || 0;
const strengthClass = (id) => {
  const b = boxOf(id);
  return b >= 5 ? 's' : b >= 3 ? 'm' : b >= 1 ? 'w' : '';
};
const strengthLegend = `<div class="letters-legend">
  <span><i class="w"></i>fresh</span>
  <span><i class="m"></i>getting there</span>
  <span><i class="s"></i>solid</span>
  <span class="muted">— shading = how it's holding up in your reviews</span>
</div>`;

// ---------- browse ----------

function renderGrid() {
  main.innerHTML = `
    <h2>Letters <span class="muted">· ${count('letters')}/28 learned</span></h2>
    <p class="muted">Tap a letter to see its forms, hear its sound, and practise writing it.</p>
    <p class="muted">New to the script? <a href="basics.html">See how letters join and how the marks work →</a></p>
    <div class="row"><a class="btn" href="#quiz">Test yourself →</a><a class="btn btn-ghost" href="#recall">Recall practice</a></div>
    <div class="letter-grid" id="letter-grid"></div>
    ${strengthLegend}

    <h2 class="section-title">Harakat — vowels &amp; marks <a class="muted" href="basics.html#marks">how they work →</a></h2>
    <div class="harakat-grid" id="harakat-grid"></div>

    <h2 class="section-title">Connected letters</h2>
    <section class="card">
      <p class="sample-joins" lang="ar" dir="rtl">بـ ـبـ ـب</p>
      <p class="muted">Most letters change shape with their position in a word — those are the four
      forms you see on every letter page. Six letters
      <span class="ar" lang="ar" dir="rtl">ا د ذ ر ز و</span> never join the letter that follows,
      which is what creates the small gaps inside words. <a href="basics.html#join">See it step by step →</a></p>
    </section>`;

  const grid = main.querySelector('#letter-grid');
  for (const l of letters) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `letter-cell ${isLearned('letters', l.id) ? 'learned' : ''} ${strengthClass(l.id)}`.trim();
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
      </div>`,
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

    <div class="row">
      <button type="button" class="btn" id="trace">Practice writing</button>
      <a class="btn btn-ghost" href="words.html#build/${l.id}">Build words with this letter →</a>
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
    <p class="center muted" id="trace-msg">Trace the dashed letter — stay on the line, dots included.</p>`;

  const trace = mountTrace(main.querySelector('#trace-slot'), l.ar);

  main.querySelector('#erase').addEventListener('click', () => trace.clear());
  main.querySelector('#check').addEventListener('click', () => {
    const { coverage, precision, missedParts, ok } = trace.checkCoverage();
    graded('letters', ok);
    const msg = main.querySelector('#trace-msg');
    const pct = Math.round(coverage * 100);
    if (ok) {
      mark('letters', l.id);
      msg.textContent = `Nice — ${pct}% of the letter covered. Marked as learned.`;
      toast(`${l.name} marked as learned`);
      setTimeout(() => {
        // don't pull the learner back here if they already moved on
        if (document.getElementById('trace-slot')) renderDetail(l.id);
      }, 900);
    } else if (missedParts > 0) {
      msg.textContent = 'Some parts are missing — check the dots and trace every stroke of the letter.';
    } else if (precision < 0.88) {
      msg.textContent = 'Too much of your ink is off the dashed line — follow it exactly (don\u2019t fill or scribble).';
    } else {
      msg.textContent = `Almost — ${pct}% covered. Close the gaps and check again.`;
    }
  });
  main.querySelector('#back').addEventListener('click', () => renderDetail(id));
}

// ---------- shared drill plumbing ----------

const freshRound = () => ({ order: [], i: 0, got: 0, answered: false, log: [], missed: [], opts: null, optsFor: -1, q: null, qFor: -1 });

// A pending "advance to the next question" timer must never fire after the
// learner has navigated elsewhere (it would yank them back into the drill).
let pendingAdvance = null;
const clearPendingAdvance = () => {
  if (pendingAdvance) {
    clearTimeout(pendingAdvance);
    pendingAdvance = null;
  }
};

const Q = { letters: freshRound(), forms: freshRound(), vowels: freshRound() };
const R = { say: freshRound(), trace: freshRound() };

// Which items are due / never seen for a given SRS key space.
function roundFor(items, keyFn) {
  const all = loadSRS();
  return letterRound(items, dueIds(all), Object.keys(all), ROUND, Math.random, keyFn);
}

const dots = (s) => `<div class="q-dots" aria-hidden="true">${[...Array(s.order.length)]
  .map((_, k) => {
    const state = k < s.log.length ? (s.log[k] ? 'good' : 'bad') : k === s.log.length ? 'now' : '';
    return `<span class="q-dot ${state}"></span>`;
  })
  .join('')}</div>`;

function roundDone(s, labels, onAgain, extra = '') {
  const missed = s.missed;
  return `<section class="card center">
    <h2>Round done</h2>
    <p>${s.got} of ${s.order.length} correct.</p>
    ${
      missed.length
        ? `<p class="muted">Worth another look:</p><div class="q-missed">${missed
            .map((item) => `<button type="button" class="q-miss-row" data-miss="${esc(item.id)}">${labels.card(item)}</button>`)
            .join('')}</div>`
        : '<p class="muted">Clean round — nothing missed.</p>'
    }
    <div class="row" style="justify-content:center">
      <button type="button" class="btn" id="again">Another round</button>
      ${extra}
    </div>
  </section>`;
}

// ---------- quiz ----------

function renderQuiz() {
  const mode = quizMode();
  const s = Q[mode];
  const pool = mode === 'vowels' ? harakat : letters;
  const keyFn = mode === 'vowels' ? (x) => vowelKey(x.id) : (x) => letterKey(x.id);

  if (!s.order.length) s.order = roundFor(pool, keyFn);
  if (!s.order.length) {
    main.innerHTML = `${tabBar('quiz')}<section class="card"><p class="muted">No data loaded.</p></section>`;
    return;
  }

  const head = `${tabBar('quiz')}${subSeg(QUIZ_MODES, mode, 'qmode')}`;

  if (s.i >= s.order.length) {
    const labels = {
      card: (item) =>
        mode === 'vowels'
          ? `<span class="muted">${esc(item.name)} — ${esc(item.sound)}</span>`
          : `<span lang="ar" dir="rtl">${esc(item.ar)}</span><span class="muted">${esc(item.name)} — /${esc(item.sound)}/</span>`,
    };
    main.innerHTML = head + roundDone(s, labels, () => {}, `<a class="btn btn-ghost" href="#recall">Recall practice →</a>`);
    for (const b of main.querySelectorAll('.q-miss-row')) {
      b.addEventListener('click', () => {
        const item = pool.find((x) => x.id === b.dataset.miss);
        if (item && item.audio) play(`assets/audio/${item.audio}`, item.name);
      });
    }
    main.querySelector('#again').addEventListener('click', () => {
      Q[mode] = freshRound();
      renderQuiz();
    });
    return;
  }

  const item = s.order[s.i];
  s.answered = false;
  // Options are built ONCE per question (a re-render must never reshuffle them).
  if (s.optsFor !== s.i) {
    if (mode === 'vowels') {
      s.opts = vowelOptions(item, harakat, 4);
      s.q = { kind: 'vowel' };
    } else if (mode === 'forms') {
      const q = formQuestion(item, letters, groups, 4);
      s.opts = q ? q.options : null;
      s.q = q ? { kind: 'form', position: q.position } : null;
    } else {
      s.opts = letterOptions(item, letters, groups, 4);
      s.q = { kind: 'letter' };
    }
    s.optsFor = s.i;
    if (!s.opts || !s.q) {
      s.i += 1; // no fair question available for this item — skip
      return renderQuiz();
    }
  }

  const prompt =
    mode === 'vowels'
      ? `<div class="lq-big" lang="ar" dir="rtl">${esc(item.display)}</div>
         <p class="lq-sub">Which vowel mark is this?</p>`
      : mode === 'forms'
        ? `<div class="lq-big" lang="ar" dir="rtl">${esc(item.forms[s.q.position])}</div>
           <p class="lq-sub">Which letter is this? — a form as it appears inside a word</p>`
        : `<p class="lq-sub">Hear the letter's name, then pick it.</p>`;

  const audioBtn =
    mode === 'letters' && item.audio
      ? `<button type="button" class="btn" id="hear">${PLAY_SVG} Hear it</button>`
      : mode === 'forms' && item.audio
        ? `<button type="button" class="btn btn-ghost" id="hear">${PLAY_SVG} Hear its name</button>`
        : '';

  const optionGlyph = (o) => (mode === 'vowels' ? esc(o.display) : mode === 'forms' ? esc(o.forms[s.q.position]) : esc(o.ar));

  main.innerHTML = `
    ${head}
    <section class="card">
      <div class="lq-head">
        ${dots(s)}
        <span class="counter-chip">${s.i + 1} / ${s.order.length}</span>
      </div>
      <div class="lq-prompt">${prompt}</div>
      ${audioBtn ? `<div class="row" style="justify-content:center;margin-bottom:0.7rem">${audioBtn}</div>` : ''}
      <div class="lq-opts" id="opts">
        ${[...Array(4)]
          .map((_, k) => {
            const o = s.opts[k];
            return `<button type="button" class="lq-opt" data-k="${k}">${optionGlyph(o)}</button>`;
          })
          .join('')}
      </div>
      <div id="fb" class="center muted" style="margin-top:0.6rem">&nbsp;</div>
      <div id="learn"></div>
    </section>`;

  const hear = main.querySelector('#hear');
  if (hear) {
    hear.addEventListener('click', () => {
      play(`assets/audio/${item.audio}`, item.name);
      hear.innerHTML = `${PLAY_SVG} Hear it again`;
    });
  }

  const learnCard = (correct) => {
    if (mode === 'vowels') {
      return `<div class="learn-card"><div class="lc-top"><strong>${esc(item.name)}</strong><span class="ar" lang="ar" dir="rtl">${esc(item.name_ar)}</span><span class="muted">/${esc(item.sound)}/</span></div>
        <p class="muted" style="margin:0">This mark gives the letter the “${esc(item.sound)}” vowel sound.</p></div>`;
    }
    const formsRow = `<div class="mini-forms">
      ${['isolated', 'initial', 'medial', 'final']
        .map(
          (p) => `<div><b lang="ar" dir="rtl">${item.forms[p] ? esc(item.forms[p]) : '—'}</b><span class="muted">${p}</span></div>`,
        )
        .join('')}
    </div>`;
    const posNote = mode === 'forms' ? `<p class="muted" style="margin:0">That was its <strong>${esc(s.q.position)}</strong> form.</p>` : '';
    return `<div class="learn-card">
      <div class="lc-top"><span class="lc-glyph" lang="ar" dir="rtl">${esc(item.ar)}</span><strong>${esc(item.name)}</strong>
        <span class="ar" lang="ar" dir="rtl">${esc(item.name_ar)}</span><span class="muted">/${esc(item.sound)}/</span></div>
      ${posNote}${formsRow}</div>`;
  };

  for (const btn of main.querySelectorAll('.lq-opt')) {
    btn.addEventListener('click', () => {
      if (s.answered) return;
      s.answered = true;
      const chosen = s.opts[Number(btn.dataset.k)];
      const correct = chosen.id === item.id;
      const keyFn2 = mode === 'vowels' ? vowelKey : letterKey;
      review(keyFn2(item.id), correct);
      graded(mode === 'vowels' ? 'vowels' : 'letters', correct);
      s.log = [...s.log, correct];
      if (correct) s.got += 1;
      else s.missed = [...s.missed, item];
      for (const b of main.querySelectorAll('.lq-opt')) {
        const o = s.opts[Number(b.dataset.k)];
        if (o.id === item.id) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
        b.disabled = true;
      }
      main.querySelector('#fb').innerHTML = correct
        ? `<strong style="color:var(--brand2)">Correct ✓</strong>`
        : `<strong style="color:#B0413E">Not quite — it is the first one</strong>`;
      main.querySelector('#learn').innerHTML = learnCard(correct);
      clearPendingAdvance();
      pendingAdvance = setTimeout(() => {
        pendingAdvance = null;
        s.i += 1;
        s.optsFor = -1;
        renderQuiz();
      }, correct ? 900 : 2100);
    });
  }

  for (const a of main.querySelectorAll('[data-qmode]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.qmode === mode) return;
      set('prefs', { ...prefs(), letterQuiz: a.dataset.qmode });
      const target = `#quiz/${a.dataset.qmode}`;
      if (location.hash === target) renderQuiz();
      else location.hash = target;
    });
  }
}

// ---------- recall ----------

function renderRecall() {
  const mode = recallMode();
  const s = R[mode];
  const keyFn = (x) => letterKey(x.id);

  if (!s.order.length) s.order = roundFor(letters, keyFn);
  const head = `${tabBar('recall')}${subSeg(RECALL_MODES, mode, 'rmode')}`;

  if (s.i >= s.order.length) {
    const labels = {
      card: (item) => `<span lang="ar" dir="rtl">${esc(item.ar)}</span><span class="muted">${esc(item.name)} — /${esc(item.sound)}/</span>`,
    };
    main.innerHTML = head + roundDone(s, labels, () => {}, `<a class="btn btn-ghost" href="#quiz">Quiz →</a>`);
    for (const b of main.querySelectorAll('.q-miss-row')) {
      b.addEventListener('click', () => {
        const item = letters.find((x) => x.id === b.dataset.miss);
        if (item && item.audio) play(`assets/audio/${item.audio}`, item.name);
      });
    }
    main.querySelector('#again').addEventListener('click', () => {
      R[mode] = freshRound();
      renderRecall();
    });
    return;
  }

  const item = s.order[s.i];
  if (mode === 'say') {
    main.innerHTML = `
      ${head}
      <section class="card">
        <div class="lq-head">${dots(s)}<span class="counter-chip">${s.i + 1} / ${s.order.length}</span></div>
        <div class="lr-card">
          <div class="lr-glyph" lang="ar" dir="rtl">${esc(item.ar)}</div>
          <p class="muted" style="margin:0">Say its sound and its name <strong>out loud</strong>, then check yourself.</p>
        </div>
        <div class="lr-actions" id="reveal-row">
          <button type="button" class="btn" id="reveal">Show me</button>
        </div>
        <div id="after"></div>
      </section>`;

    main.querySelector('#reveal').addEventListener('click', () => {
      main.querySelector('#reveal-row').remove();
      main.querySelector('#after').innerHTML = `
        <div class="learn-card">
          <div class="lc-top"><span class="lc-glyph" lang="ar" dir="rtl">${esc(item.ar)}</span><strong>${esc(item.name)}</strong>
            <span class="ar" lang="ar" dir="rtl">${esc(item.name_ar)}</span><span class="muted">/${esc(item.sound)}/</span>
            ${item.audio ? `<button type="button" class="btn btn-ghost" id="play2" style="margin-left:auto">${PLAY_SVG} Hear it</button>` : ''}</div>
          <p class="muted" style="margin:0">Did you get both the sound and the name right — honestly?</p>
          <div class="lr-actions">
            <button type="button" class="btn btn-ghost" id="again2">Not yet</button>
            <button type="button" class="btn" id="got2">Got it</button>
          </div>
        </div>`;
      const p2 = main.querySelector('#play2');
      if (p2) p2.addEventListener('click', () => play(`assets/audio/${item.audio}`, item.name));
      main.querySelector('#again2').addEventListener('click', () => gradeRecall(mode, item, false));
      main.querySelector('#got2').addEventListener('click', () => gradeRecall(mode, item, true));
    });
  } else {
    main.innerHTML = `
      ${head}
      <section class="card">
        <div class="lq-head">${dots(s)}<span class="counter-chip">${s.i + 1} / ${s.order.length}</span></div>
        <p class="muted center" style="margin:0 0 0.5rem">Hear the name, then write the letter <strong>from memory</strong> — the guide stays hidden until you ask.</p>
        <div class="row" style="justify-content:center;margin-bottom:0.6rem">
          <button type="button" class="btn" id="hear">${PLAY_SVG} Hear it</button>
        </div>
        <div id="trace-slot"></div>
        <div class="lr-actions">
          <button type="button" class="btn btn-ghost" id="show">Show the letter</button>
          <button type="button" class="btn btn-ghost" id="erase">Erase</button>
        </div>
        <div id="after"></div>
      </section>`;

    const trace = mountTrace(main.querySelector('#trace-slot'), item.ar, { slider: false });
    const guide = main.querySelector('.trace-guide');
    guide.style.visibility = 'hidden';

    main.querySelector('#hear').addEventListener('click', () => play(`assets/audio/${item.audio}`, item.name));
    main.querySelector('#erase').addEventListener('click', () => trace.clear());
    main.querySelector('#show').addEventListener('click', () => {
      guide.style.visibility = 'visible';
      main.querySelector('#show').remove();
      main.querySelector('#after').innerHTML = `
        <div class="learn-card">
          <div class="lc-top"><span class="lc-glyph" lang="ar" dir="rtl">${esc(item.ar)}</span><strong>${esc(item.name)}</strong>
            <span class="muted">/${esc(item.sound)}/</span></div>
          <p class="muted" style="margin:0">Compare the dashed letter with what you wrote. Close enough?</p>
          <div class="lr-actions">
            <button type="button" class="btn btn-ghost" id="again2">Not yet</button>
            <button type="button" class="btn" id="got2">Got it</button>
          </div>
        </div>`;
      main.querySelector('#again2').addEventListener('click', () => gradeRecall(mode, item, false));
      main.querySelector('#got2').addEventListener('click', () => gradeRecall(mode, item, true));
    });
  }

  for (const a of main.querySelectorAll('[data-rmode]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.rmode === mode) return;
      set('prefs', { ...prefs(), letterRecall: a.dataset.rmode });
      const target = `#recall/${a.dataset.rmode}`;
      if (location.hash === target) renderRecall();
      else location.hash = target;
    });
  }
}

function gradeRecall(mode, item, good) {
  const s = R[mode];
  review(letterKey(item.id), good);
  graded('letters', good);
  s.log = [...s.log, good];
  if (good) s.got += 1;
  else s.missed = [...s.missed, item];
  s.i += 1;
  renderRecall();
}

// ---------- boot ----------

function render() {
  clearPendingAdvance(); // a tab switch cancels a queued quiz advance
  const tab = tabFromHash();
  if (tab === 'quiz') return renderQuiz();
  if (tab === 'recall') return renderRecall();
  return renderGrid();
}

async function init() {
  try {
    const [l, h, g] = await Promise.all([
      loadData('letters.json'),
      loadData('harakat.json'),
      loadData('letter-groups.json'),
    ]);
    letters = l;
    harakat = h;
    groups = g.groups || [];
  } catch (e) {
    main.innerHTML = `<section class="card"><p>Could not load letter data: ${esc(e.message)}</p></section>`;
    return;
  }
  render();
  window.addEventListener('hashchange', render);
}

init();
