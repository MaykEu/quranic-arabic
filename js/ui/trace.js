// Canvas tracing component: dashed SVG guide + ink canvas + coverage scoring.
// Used for letters (isolated form) and later for whole words on the practice page.
//
// How the check works ("is it right?"):
//   1. the letter is drawn invisibly and every letter-pixel is recorded;
//   2. those pixels are sampled every 3px and we ask: is there ink within ~13px?
//      coverage = share of letter pixels that have ink nearby (>= 75% passes);
//   3. we also measure "ink discipline": the share of the user's ink that lies near
//      the letter shape — so scribbling all over the canvas does not pass.
export function mountTrace(container, glyph, { size = 300, brush = 6 } = {}) {
  container.classList.add('trace-wrap');
  container.innerHTML = `
    <svg class="trace-guide" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <text x="${size / 2}" y="${size * 0.73}" text-anchor="middle" font-size="${size * 0.6}"
            font-family="Amiri, serif" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-dasharray="5 9">${glyph}</text>
    </svg>
    <canvas class="trace-canvas" width="${size}" height="${size}"></canvas>`;

  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = brush;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#14555A';

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

  // Returns { coverage, inkNear, inkTotal, ok }.
  //   coverage — share of the letter's pixels your ink covers (0..1)
  //   inkNear  — share of YOUR ink that lies near the letter (0..1)
  //   ok       — pass condition: coverage >= 0.6 AND at least 60% of ink on-shape
  function checkCoverage({ step = 3, radius = 13, inkStep = 2, near = radius + 8 } = {}) {
    // target mask: render the glyph off-screen and read its pixels
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const o = off.getContext('2d');
    o.font = `${size * 0.6}px Amiri, serif`;
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    o.fillText(glyph, size / 2, size * 0.73);
    const target = o.getImageData(0, 0, size, size).data;

    // dilated "near the letter" map, for the ink-discipline test
    const allowed = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        if (target[(y * size + x) * 4 + 3] < 128) continue;
        const y0 = Math.max(0, y - near);
        const y1 = Math.min(size - 1, y + near);
        const x0 = Math.max(0, x - near);
        const x1 = Math.min(size - 1, x + near);
        for (let yy = y0; yy <= y1; yy++) allowed.fill(1, yy * size + x0, yy * size + x1 + 1);
      }
    }

    const drawn = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / size;
    const alphaAt = (x, y) => drawn[(Math.round(y * scale) * canvas.width + Math.round(x * scale)) * 4 + 3];

    // coverage: letter pixels that have ink nearby
    let need = 0;
    let hit = 0;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        if (target[(y * size + x) * 4 + 3] < 128) continue;
        need++;
        let covered = false;
        for (let dy = -radius; dy <= radius && !covered; dy += 2) {
          for (let dx = -radius; dx <= radius && !covered; dx += 2) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            if (alphaAt(xx, yy) > 40) covered = true;
          }
        }
        if (covered) hit++;
      }
    }
    const coverage = need ? hit / need : 0;

    // ink discipline: how much of the user's ink is near the letter
    let inkTotal = 0;
    let inkNearCount = 0;
    for (let y = 0; y < size; y += inkStep) {
      for (let x = 0; x < size; x += inkStep) {
        if (alphaAt(x, y) <= 40) continue;
        inkTotal++;
        if (allowed[y * size + x]) inkNearCount++;
      }
    }
    const inkNear = inkTotal ? inkNearCount / inkTotal : 0;

    return { coverage, inkNear, inkTotal, ok: coverage >= 0.75 && inkTotal > 0 && inkNear >= 0.6 };
  }

  return { clear, checkCoverage };
}
