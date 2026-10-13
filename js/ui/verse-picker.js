// Verse picker overlay — pick a surah, then an ayah. Presentation only; the
// caller receives (s, a) via onPick. Used by Practice (read aloud + recall).
import { loadData } from '../lib/data.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function openVersePicker({ onPick, onClose } = {}) {
  const idx = await loadData('quran/index.json');
  const surahs = idx.surahs;

  const root = document.createElement('div');
  root.className = 'picker-overlay';
  root.innerHTML = `
    <div class="picker-sheet" role="dialog" aria-modal="true" aria-label="Choose a verse">
      <div class="picker-head">
        <button type="button" class="btn btn-ghost" id="pk-back" hidden>←</button>
        <strong id="pk-title">Choose a surah</strong>
        <button type="button" class="btn btn-ghost" id="pk-close" aria-label="Close">✕</button>
      </div>
      <div class="picker-body" id="pk-body"></div>
    </div>`;
  document.body.appendChild(root);

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    document.removeEventListener('keydown', onKey);
    root.remove();
    onClose?.();
  }

  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  root.querySelector('#pk-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  const body = root.querySelector('#pk-body');
  const backBtn = root.querySelector('#pk-back');
  const title = root.querySelector('#pk-title');

  function surahList() {
    backBtn.hidden = true;
    title.textContent = 'Choose a surah';
    body.innerHTML = `<div class="surah-list">
      ${surahs
        .map(
          (s) => `
        <button type="button" class="surah-row" data-s="${s.id}">
          <span class="sr-num">${s.id}</span>
          <span>
            <span class="sr-name">${esc(s.name_simple)}</span>
            <span class="sr-meta">${esc(s.name_translit)} · ${s.verses_count} verses</span>
          </span>
          <span class="sr-ar" lang="ar" dir="rtl">${esc(s.name_arabic)}</span>
        </button>`,
        )
        .join('')}
    </div>`;
    body.querySelectorAll('.surah-row').forEach((b) =>
      b.addEventListener('click', () => ayahGrid(surahs.find((x) => x.id === Number(b.dataset.s)))),
    );
  }

  function ayahGrid(s) {
    backBtn.hidden = false;
    title.textContent = `${s.name_simple} — ${s.verses_count} verses`;
    body.innerHTML = `
      ${
        s.verses_count > 40
          ? `<div class="pk-jump">
               <input id="pk-num" type="number" min="1" max="${s.verses_count}" placeholder="ayah #" inputmode="numeric">
               <button type="button" class="btn btn-ghost" id="pk-go">Go</button>
             </div>`
          : ''
      }
      <div class="pk-grid">
        ${Array.from({ length: s.verses_count }, (_, i) => `<button type="button" class="pk-ayah" data-a="${i + 1}">${i + 1}</button>`).join('')}
      </div>`;
    body.querySelectorAll('.pk-ayah').forEach((b) =>
      b.addEventListener('click', () => {
        onPick?.(s.id, Number(b.dataset.a));
        close();
      }),
    );
    const go = body.querySelector('#pk-go');
    if (go) {
      const num = body.querySelector('#pk-num');
      const jump = () => {
        const n = Math.max(1, Math.min(s.verses_count, Number(num.value) || 0));
        if (num.value) {
          onPick?.(s.id, n);
          close();
        }
      };
      go.addEventListener('click', jump);
      num.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') jump();
      });
    }
  }

  backBtn.addEventListener('click', surahList);
  surahList();
}
