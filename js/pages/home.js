// Home — the "Today" card: today's plan composed from real state, a focus
// override (auto / letters / words / reading), and days-this-week. Soft
// guidance only — nothing is locked; any level can jump anywhere.
import { todayPlan, STAGE_INFO, getFocus, setFocus } from '../lib/path.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FOCUS_OPTIONS = ['auto', 'letters', 'words', 'reading'];

function renderToday() {
  const plan = todayPlan();
  const focus = getFocus();
  const s = plan.stats;

  const section = document.createElement('section');
  section.className = 'card today-card';
  section.innerHTML = `
    <div class="row tb-head">
      <h2 style="margin:0">Today</h2>
      <span class="stage-chip">${esc(STAGE_INFO[plan.stage].chip)}</span>
    </div>
    <p class="muted">${esc(STAGE_INFO[plan.stage].line)}</p>
    <ol class="today-blocks">
      ${plan.blocks
        .map(
          (b) => `
        <li class="today-block">
          <div class="tb-text">
            <strong>${esc(b.title)}</strong>
            <span class="muted">${esc(b.desc)}</span>
          </div>
          <a class="btn btn-ghost tb-cta" href="${b.href}">${esc(b.cta)}</a>
        </li>`,
        )
        .join('')}
    </ol>
    <div class="row today-foot">
      <div class="focus-wrap">
        <span class="muted">Focus:</span>
        ${FOCUS_OPTIONS.map(
          (f) => `<button type="button" class="chip-btn ${focus === f ? 'on' : ''}" data-f="${f}">${f}</button>`,
        ).join('')}
      </div>
      <span class="muted">${s.daysThisWeek} day${s.daysThisWeek === 1 ? '' : 's'} this week</span>
    </div>
    <p class="muted small">Nothing is locked — every section is open at any level. See
    <a href="guide.html">how to learn</a> for the order and the why.</p>`;

  for (const b of section.querySelectorAll('.chip-btn')) {
    b.addEventListener('click', () => {
      setFocus(b.dataset.f);
      mount();
    });
  }
  return section;
}

function mount() {
  const old = document.querySelector('.today-card');
  const fresh = renderToday();
  if (old) {
    old.replaceWith(fresh);
  } else {
    const hero = document.querySelector('main .hero');
    if (hero) hero.after(fresh);
    else document.querySelector('main')?.prepend(fresh);
  }
}

mount();
