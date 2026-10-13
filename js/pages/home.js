// Home — one clean card: open the learning guide (+ pick up where you left off).
import { get } from '../lib/store.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  const lastRead = get('lastRead', null);

  const section = document.createElement('section');
  section.className = 'card guide-cta';
  section.innerHTML = `
    <h2 style="margin:0 0 6px">How to learn</h2>
    <p class="muted" style="margin:0 0 12px">New to Arabic? The guide walks you through it in order —
    letters, vowels, first words, then reading. About 15 minutes a day.</p>
    <a class="btn" href="guide.html">Open the learning guide</a>
    ${
      lastRead
        ? `<p class="muted small" style="margin:12px 0 0">Pick up where you left off:
           <a href="verses.html#${lastRead.s}:${lastRead.a}">Surah ${lastRead.s}, verse ${lastRead.a} →</a></p>`
        : ''
    }`;

  const hero = document.querySelector('main .hero');
  if (hero) hero.after(section);
  else document.querySelector('main')?.prepend(section);
}

render();
