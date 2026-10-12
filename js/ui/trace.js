// Canvas tracing component: dashed SVG guide + ink canvas + coverage scoring.
// Used for letters (isolated form) and later for whole words on the practice page.
export function mountTrace(container, glyph, { size = 300 } = {}) {
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
  ctx.lineWidth = 11;
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

  // Fraction of the letter's outline pixels that the user's ink covers (0..1).
  function checkCoverage({ step = 3, radius = 13 } = {}) {
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const o = off.getContext('2d');
    o.font = `${size * 0.6}px Amiri, serif`;
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    o.fillText(glyph, size / 2, size * 0.73);
    const target = o.getImageData(0, 0, size, size).data;
    const drawn = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / size;
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
            const px = Math.round(xx * scale);
            const py = Math.round(yy * scale);
            if (drawn[(py * canvas.width + px) * 4 + 3] > 40) covered = true;
          }
        }
        if (covered) hit++;
      }
    }
    return need ? hit / need : 0;
  }

  return { clear, checkCoverage };
}
