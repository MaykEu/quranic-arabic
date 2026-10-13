// About page: static content + a version/update check so you can always tell
// which build your browser is actually running.
//
// - "Version" is read through the service worker cache (what THIS browser has).
// - "Latest deployed" bypasses the cache with a cache-busting URL.
// - If they differ, an Update button updates the service worker and reloads.
const CARD = document.createElement('section');
CARD.className = 'card';
CARD.id = 'version-card';
CARD.innerHTML = `
  <h2>App version</h2>
  <p class="muted" id="version-line">Checking…</p>
  <div class="row" id="version-actions" hidden>
    <button type="button" class="btn" id="update-now">Update now</button>
  </div>`;

async function versionOf(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    const m = text.match(/const VERSION = '([^']+)'/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function render() {
  const main = document.querySelector('main');
  main.prepend(CARD);

  const running = await versionOf('sw.js');
  const deployed = await versionOf(`sw.js?nc=${Date.now()}`);
  const line = CARD.querySelector('#version-line');

  if (!deployed) {
    line.textContent = `Version ${running || 'unknown'} · could not reach the server to check for updates.`;
    return;
  }
  if (running === deployed) {
    line.textContent = `Version ${running} · up to date.`;
    return;
  }
  line.innerHTML = `You are running <strong>${running || 'an older build'}</strong>, the latest is <strong>${deployed}</strong>.`;
  CARD.querySelector('#version-actions').hidden = false;
  CARD.querySelector('#update-now').addEventListener('click', async () => {
    line.textContent = 'Updating…';
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch {
      /* ignore — a plain reload often suffices */
    }
    location.reload();
  });
}

render();
