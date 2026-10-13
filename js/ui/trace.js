// Canvas tracing component: dashed SVG guide + ink canvas + strict scoring.
//
// How the check works ("is it right?"):
//   1. the glyph is rendered invisibly; its OUTLINE (contour) is extracted —
//      that is the dashed line the learner sees and should follow;
//   2. coverage  — share of the contour your ink touches (within ~5px). Gaps fail;
//   3. precision — share of YOUR ink that stays near the contour (~10px band).
//      Zigzags, filling the whole area, or wandering off fail here;
//   4. parts     — the contour splits into parts (strokes + dots). Every part of
//      a reasonable size must be traced (>= 60%), so a missing dot fails.
// Pass = coverage >= 0.85 · precision >= 0.88 · no missing part · enough ink.
import { get, set } from '../lib/store.js';

const DEFAULT_BRUSH = 6;

export function mountTrace(container, glyph, { size = 300, brush = null, slider = true } = {}) {
  container.classList.add('trace-wrap');
  container.innerHTML = `
    <div class="trace-stage">
      <svg class="trace-guide" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <text x="${size / 2}" y="${size * 0.73}" text-anchor="middle" font-size="${size * 0.6}"
              font-family="Amiri, serif" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-dasharray="5 9">${glyph}</text>
      </svg>
      <canvas class="trace-canvas" width="${size}" height="${size}"></canvas>
    </div>
    ${
      slider
        ? `<div class="trace-controls">
             <span class="muted">Brush</span>
             <input type="range" id="brush-slider" min="3" max="18" step="1" aria-label="Brush size">
           </div>`
        : ''
    }`;

  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = brush || get('brush', null) || DEFAULT_BRUSH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#14555A';

  const sliderEl = container.querySelector('#brush-slider');
  if (sliderEl) {
    sliderEl.value = String(ctx.lineWidth);
    sliderEl.addEventListener('input', () => {
      ctx.lineWidth = Number(sliderEl.value);
      set('brush', Number(sliderEl.value));
    });
  }

  const ink = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand2').trim() || '#14555A';

  document.fonts?.load?.(`${size}px Amiri`).catch(() => {});

  let drawing = false;
  let last = null;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size,
      y: ((e.clientY - r.top) / r.height) * size,
    };
  };
  const dot = (p) => {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
  };
  const line = (a, b) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.strokeStyle = ink();
    last = pos(e);
    dot(last);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    line(last, p);
    last = p;
    e.preventDefault();
  });
  for (const ev of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(ev, () => {
      drawing = false;
      last = null;
    });
  }

  function clear() {
    ctx.clearRect(0, 0, size, size);
  }

  // ---- scoring helpers (all on the logical `size` x `size` grid) ----

  function guideMask() {
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const o = off.getContext('2d');
    o.font = `${size * 0.6}px Amiri, serif`;
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    o.fillText(glyph, size / 2, size * 0.73);
    const d = o.getImageData(0, 0, size, size).data;
    const g = new Uint8Array(size * size);
    for (let i = 0; i < g.length; i++) g[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    return g;
  }

  function inkMask() {
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / size;
    const a = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      const sy = Math.min(canvas.height - 1, Math.round(y * scale));
      for (let x = 0; x < size; x++) {
        const sx = Math.min(canvas.width - 1, Math.round(x * scale));
        a[y * size + x] = d[(sy * canvas.width + sx) * 4 + 3] > 40 ? 1 : 0;
      }
    }
    return a;
  }

  // box-dilate a mask by r pixels (two sliding-window passes)
  function dilate(src, r) {
    const n = size;
    const tmp = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) {
      const row = y * n;
      let run = 0;
      for (let x = 0; x < n; x++) {
        if (src[row + x]) run = r;
        else if (run > 0) run--;
        if (run > 0) tmp[row + x] = 1;
      }
      run = 0;
      for (let x = n - 1; x >= 0; x--) {
        if (src[row + x]) run = r;
        else if (run > 0) run--;
        if (run > 0) tmp[row + x] = 1;
      }
    }
    const out = new Uint8Array(n * n);
    for (let x = 0; x < n; x++) {
      let run = 0;
      for (let y = 0; y < n; y++) {
        const i = y * n + x;
        if (tmp[i]) run = r;
        else if (run > 0) run--;
        if (run > 0) out[i] = 1;
      }
      run = 0;
      for (let y = n - 1; y >= 0; y--) {
        const i = y * n + x;
        if (tmp[i]) run = r;
        else if (run > 0) run--;
        if (run > 0) out[i] = 1;
      }
    }
    return out;
  }

  // contour = glyph pixels with at least one non-glyph 4-neighbor
  function contourOf(g) {
    const c = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (!g[i]) continue;
        const l = x > 0 ? g[i - 1] : 0;
        const r = x < size - 1 ? g[i + 1] : 0;
        const u = y > 0 ? g[i - size] : 0;
        const d = y < size - 1 ? g[i + size] : 0;
        if (!l || !r || !u || !d) c[i] = 1;
      }
    }
    return c;
  }

  function labelComponents(mask) {
    const labels = new Int32Array(size * size).fill(-1);
    let count = 0;
    const stack = [];
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start] >= 0) continue;
      labels[start] = count;
      stack.length = 0;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop();
        const x = i % size;
        const y = (i / size) | 0;
        if (x > 0 && mask[i - 1] && labels[i - 1] < 0) {
          labels[i - 1] = count;
          stack.push(i - 1);
        }
        if (x < size - 1 && mask[i + 1] && labels[i + 1] < 0) {
          labels[i + 1] = count;
          stack.push(i + 1);
        }
        if (y > 0 && mask[i - size] && labels[i - size] < 0) {
          labels[i - size] = count;
          stack.push(i - size);
        }
        if (y < size - 1 && mask[i + size] && labels[i + size] < 0) {
          labels[i + size] = count;
          stack.push(i + size);
        }
      }
      count++;
    }
    return { labels, count };
  }

  // Returns { ok, coverage, precision, missedParts, parts, inkTotal }.
  function checkCoverage({ pad = 5, band = 10, compMinRatio = 0.6, compMinSize = 25 } = {}) {
    const g = guideMask();
    const a = inkMask();
    const contour = contourOf(g);

    const inkReach = dilate(a, pad); // where ink can cover the contour
    const contourBand = dilate(contour, band); // allowed zone for ink

    // coverage: contour pixels touched by ink (within pad)
    let cTotal = 0;
    let cHit = 0;
    for (let i = 0; i < contour.length; i++) {
      if (!contour[i]) continue;
      cTotal++;
      if (inkReach[i]) cHit++;
    }
    const coverage = cTotal ? cHit / cTotal : 0;

    // precision: ink pixels inside the contour band
    let inkTotal = 0;
    let inkNearCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      inkTotal++;
      if (contourBand[i]) inkNearCount++;
    }
    const precision = inkTotal ? inkNearCount / inkTotal : 0;

    // parts: every contour component of a reasonable size must be traced
    const merged = dilate(contour, 2); // bridge hairline breaks for labelling
    const { labels, count } = labelComponents(merged);
    const totals = new Array(count).fill(0);
    const hits = new Array(count).fill(0);
    for (let i = 0; i < contour.length; i++) {
      if (!contour[i]) continue;
      const l = labels[i];
      if (l < 0) continue;
      totals[l]++;
      if (inkReach[i]) hits[l]++;
    }
    let missedParts = 0;
    let parts = 0;
    for (let l = 0; l < count; l++) {
      if (totals[l] < compMinSize) continue;
      parts++;
      if (hits[l] / totals[l] < compMinRatio) missedParts++;
    }

    const ok = coverage >= 0.85 && precision >= 0.88 && missedParts === 0 && inkTotal >= 30;
    return { ok, coverage, precision, missedParts, parts, inkTotal };
  }

  return { clear, checkCoverage };
}
