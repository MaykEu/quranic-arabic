// Build mode ("Words → Build"): assemble words from letter tiles.
//
// Rack tiles show isolated letters. The ribbon is a live Arabic string, so the
// font re-shapes it on every placement — the learner watches each letter turn
// into its initial/medial/final form the moment the next letter joins, and sees
// where non-connectors (ا د ذ ر ز و) break the chain.
//
// Progress: completed words are marked in progress ('words' bucket, id "b:<bare>")
// and scheduled with the same spaced-repetition store as vocabulary — a word
// built with no mistakes advances a box; one that needed retries comes back first.
import { loadData } from '../lib/data.js';
import { play } from '../ui/player.js';
import { wbwFromRef } from '../lib/audio.js';
import { mark, isLearned } from '../lib/progress.js';
import { load as loadSRS, review } from '../lib/srs.js';
import { buildIndex } from '../lib/shaping.js';
import { toast } from '../ui/toast.js';

const SESSION = 5; // guided words per session
const HINT_AFTER = 2; // misses before the first-letter hint appears

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function mountBuild(container, { firstLetter = null } = {}) {
  const [data, lettersData] = await Promise.all([loadData('build-words.json'), loadData('letters.json')]);
  const index = buildIndex(lettersData);
  const all = data.words;
  const sid = (w) => `b:${w.bare}`;
  const builtCount = () => all.filter((w) => isLearned('words', sid(w))).length;

  let scope = firstLetter ? all.filter((w) => w.first === firstLetter) : all;
  const letterName = firstLetter ? lettersData.find((l) => l.id === firstLetter)?.name : null;

  // ---------- screens ----------

  function menu() {
    const built = builtCount();
    const srsAll = loadSRS();
    const dueList = scope.filter((w) => {
      const e = srsAll[sid(w)];
      return e && e.due <= Date.now();
    });
    const freshList = scope.filter((w) => !srsAll[sid(w)]);
    const todo = Math.min(SESSION, dueList.length + freshList.length);
    const empty = scope.length === 0;

    container.innerHTML = `
      <section class="card">
        <h2>Build <span class="muted">· make words from letters</span></h2>
        <p class="muted">Tap the letters in the right order. Watch each letter change shape as the next one joins.</p>
        <div class="progbar" aria-hidden="true"><i style="width:${Math.round((built / all.length) * 100)}%"></i></div>
        <p class="muted center">${built} of ${all.length} words built${dueList.length ? ` · ${dueList.length} ready for review` : ''}</p>
        ${
          empty
            ? `<p class="center">No build words start with this letter yet — try free play, or build all words.</p>
               <div class="row" style="justify-content:center"><button type="button" class="btn" id="sandbox">Free play</button></div>`
            : `<div class="row" style="justify-content:center">
                 <button type="button" class="btn" id="go" ${todo ? '' : 'disabled'}>${
                   dueList.length ? `Review ${todo}` : todo ? `Build ${todo} words` : 'All built — free play!'
                 }</button>
                 <button type="button" class="btn btn-ghost" id="sandbox">Free play</button>
               </div>`
        }
      </section>
      <section class="card">
        <h3>Words in this set</h3>
        <div class="word-chips">
          ${scope
            .map(
              (w) =>
                `<button type="button" class="chip ${isLearned('words', sid(w)) ? 'chip-done' : ''}" data-bare="${esc(w.bare)}" lang="ar" dir="rtl">${esc(w.bare)}</button>`,
            )
            .join('')}
        </div>
        <p class="muted">${letterName ? `Words starting with ${esc(letterName)}.` : 'Tap a letter of any word to hear it.'}</p>
      </section>`;

    const chips = container.querySelectorAll('.chip');
    for (const chip of chips) {
      const w = scope.find((x) => x.bare === chip.dataset.bare);
      chip.addEventListener('click', () => play(wbwFromRef(w.audio), w.bare));
    }
    const go = container.querySelector('#go');
    if (go) go.addEventListener('click', startSession);
    const sb = container.querySelector('#sandbox');
    if (sb) sb.addEventListener('click', sandbox);
  }

  function startSession() {
    const srsAll = loadSRS();
    const due = scope.filter((w) => {
      const e = srsAll[sid(w)];
      return e && e.due <= Date.now();
    });
    const fresh = scope.filter((w) => !srsAll[sid(w)]);
    const queue = [...due, ...fresh].slice(0, SESSION);
    if (!queue.length) {
      toast('Nothing to build right now — all reviewed!');
      return menu();
    }
    playWord(queue, 0, []);
  }

  // ---------- one word ----------

  function playWord(queue, qi, results) {
    if (qi >= queue.length) return summary(queue, results);
    const w = queue[qi];
    const rack = shuffle(w.letters.map((id) => ({ id, ar: index.byChar.get(entryChar(id)).ar, used: false })));
    // ensure the rack is not already in the correct order (it would defeat the game)
    if (rack.length > 1 && rack.every((t, i) => t.id === w.letters[i])) {
      [rack[0], rack[rack.length - 1]] = [rack[rack.length - 1], rack[0]];
    }

    let placed = []; // rack indexes, in placement order
    let misses = 0;
    let hinted = false;
    let done = false;

    const still = () => !done && placed.length < w.letters.length;

    container.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← Build</button>
      <p class="muted center">${qi + 1} / ${queue.length}</p>
      <section class="card build-card">
        <div class="build-prompt">
          <p class="bp-gloss">${esc(w.gloss)}</p>
          <button type="button" class="btn btn-ghost bp-play" id="play">🔊 Hear it</button>
        </div>
        <div class="ribbon" id="ribbon" aria-live="polite"></div>
        <div class="dots" id="dots" aria-hidden="true">${w.letters.map(() => '<span class="dot"></span>').join('')}</div>
        <div class="tiles" id="tiles"></div>
        <div class="row build-actions">
          <button type="button" class="btn btn-ghost" id="undo" disabled>⌫ Undo</button>
        </div>
        <p class="center muted" id="bmsg">Tap the letters in order — the first letter belongs on the right.</p>
        <p class="center build-hint" id="bhint" hidden></p>
      </section>`;

    const ribbon = container.querySelector('#ribbon');
    const tilesEl = container.querySelector('#tiles');
    const undoBtn = container.querySelector('#undo');
    const msgEl = container.querySelector('#bmsg');
    const hintEl = container.querySelector('#bhint');

    container.querySelector('#exit').addEventListener('click', menu);
    container.querySelector('#play').addEventListener('click', () => play(wbwFromRef(w.audio), w.ar));

    function draw() {
      const str = placed.map((i) => rack[i].ar).join('');
      ribbon.innerHTML = str ? `<span class="ribbon-word">${str}</span>` : `<span class="ribbon-empty">…</span>`;
      ribbon.classList.remove('pulse');
      if (str) {
        void ribbon.offsetWidth; // retrigger the animation
        ribbon.classList.add('pulse');
      }
      undoBtn.disabled = !placed.length;
      for (const [i, dot] of [...container.querySelectorAll('.dot')].entries()) {
        dot.classList.toggle('on', i < placed.length);
      }
      for (const [i, t] of rack.entries()) {
        const el = tilesEl.children[i];
        el.classList.toggle('used', t.used);
      }
    }

    function renderRack() {
      tilesEl.innerHTML = rack
        .map((t, i) => `<button type="button" class="tile" data-i="${i}" lang="ar" dir="rtl">${t.ar}</button>`)
        .join('');
      for (const el of tilesEl.children) {
        el.addEventListener('click', () => {
          const i = Number(el.dataset.i);
          if (rack[i].used || !still()) return;
          rack[i].used = true;
          placed.push(i);
          draw();
          if (placed.length === w.letters.length) setTimeout(judge, 260);
        });
      }
    }

    function judge() {
      if (done) return;
      if (placed.length < w.letters.length) return; // an undo landed inside the check window
      const ok = placed.every((ri, k) => rack[ri].id === w.letters[k]);
      if (ok) {
        done = true;
        review(sid(w), misses === 0);
        mark('words', sid(w));
        return success();
      }
      misses += 1;
      ribbon.classList.add('shake');
      setTimeout(() => ribbon.classList.remove('shake'), 350);
      msgEl.textContent = 'Not quite — tap ⌫ undo and try the last letters again.';
      if (misses >= HINT_AFTER && !hinted) {
        hinted = true;
        const firstEntry = index.byChar.get(entryChar(w.letters[0]));
        hintEl.hidden = false;
        hintEl.innerHTML = `Hint: it starts with <b>${esc(firstEntry.name)}</b> — <span lang="ar" dir="rtl">${firstEntry.forms.initial || firstEntry.ar}</span> (rightmost tile).`;
      }
    }

    function success() {
      const clean = misses === 0;
      toast(clean ? `${w.gloss} ✓` : `${w.gloss} — built`);
      container.innerHTML = `
        <p class="muted center">${qi + 1} / ${queue.length}</p>
        <section class="card build-card center">
          <p class="muted">${esc(w.gloss)}</p>
          <p class="success-word" lang="ar" dir="rtl">${esc(w.ar)}</p>
          <p class="muted">${esc(w.translit)} · Qur'an ${esc(w.ref)}</p>
          <p>${clean ? 'Built with no mistakes. Well done.' : 'Built — it will come back for review.'}</p>
          <div class="row" style="justify-content:center">
            <button type="button" class="btn" id="play">🔊 Hear it again</button>
            <button type="button" class="btn btn-ghost" id="next">${qi + 1 < queue.length ? 'Next word' : 'Finish'}</button>
          </div>
        </section>`;
      // Update the UI first, then play — a blocked autoplay must never stop the flow.
      try {
        play(wbwFromRef(w.audio), w.ar);
      } catch {
        /* audio is a bonus, not a requirement */
      }
      container.querySelector('#play').addEventListener('click', () => play(wbwFromRef(w.audio), w.ar));
      container.querySelector('#next').addEventListener('click', () =>
        playWord(queue, qi + 1, [...results, { w, clean }]),
      );
    }

    function entryChar(id) {
      const e = lettersData.find((l) => l.id === id);
      return e.ar;
    }

    undoBtn.addEventListener('click', () => {
      if (!placed.length || done) return;
      const i = placed.pop();
      rack[i].used = false;
      msgEl.textContent = 'Tap the letters in order — the first letter belongs on the right.';
      draw();
    });

    renderRack();
    draw();
  }

  // ---------- session summary ----------

  function summary(queue, results) {
    const clean = results.filter((r) => r.clean).length;
    const built = builtCount();
    container.innerHTML = `
      <section class="card center">
        <h2>Session done</h2>
        <p>${results.length} built · ${clean} with no mistakes.</p>
        <div class="progbar" aria-hidden="true"><i style="width:${Math.round((built / all.length) * 100)}%"></i></div>
        <p class="muted">${built} of ${all.length} words built.</p>
        <div class="row" style="justify-content:center">
          <button type="button" class="btn" id="more">Build more</button>
          <button type="button" class="btn btn-ghost" id="home">Back</button>
        </div>
      </section>`;
    container.querySelector('#more').addEventListener('click', startSession);
    container.querySelector('#home').addEventListener('click', menu);
  }

  // ---------- free play ----------

  function sandbox() {
    let str = '';
    const alphabet = lettersData.map((l) => l);
    container.innerHTML = `
      <button type="button" class="btn btn-ghost back" id="exit">← Build</button>
      <section class="card build-card">
        <h3 class="center">Free play</h3>
        <p class="muted center">Join any letters and watch them connect. Six letters never join to the next one:
        <span lang="ar" dir="rtl">ا د ذ ر ز و</span> — when you tap one, the chain breaks.</p>
        <div class="ribbon" id="ribbon"><span class="ribbon-empty">…</span></div>
        <div class="tiles tiles-alphabet" id="tiles">
          ${alphabet.map((l, i) => `<button type="button" class="tile tile-s" data-i="${i}" lang="ar" dir="rtl">${l.ar}</button>`).join('')}
        </div>
        <div class="row build-actions">
          <button type="button" class="btn btn-ghost" id="undo" disabled>⌫ Undo</button>
          <button type="button" class="btn btn-ghost" id="clear" disabled>Clear</button>
        </div>
      </section>`;

    const ribbon = container.querySelector('#ribbon');
    const undo = container.querySelector('#undo');
    const clear = container.querySelector('#clear');

    const draw = () => {
      ribbon.innerHTML = str
        ? `<span class="ribbon-word">${str}</span>`
        : `<span class="ribbon-empty">…</span>`;
      ribbon.classList.remove('pulse');
      if (str) {
        void ribbon.offsetWidth;
        ribbon.classList.add('pulse');
      }
      undo.disabled = !str;
      clear.disabled = !str;
    };

    for (const el of container.querySelectorAll('.tile')) {
      el.addEventListener('click', () => {
        if ([...str].length >= 12) return;
        str += alphabet[Number(el.dataset.i)].ar;
        draw();
      });
    }
    undo.addEventListener('click', () => {
      str = [...str].slice(0, -1).join('');
      draw();
    });
    clear.addEventListener('click', () => {
      str = '';
      draw();
    });
    container.querySelector('#exit').addEventListener('click', menu);
  }

  // ---------- go ----------
  menu();
}
