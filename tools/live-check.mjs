// Live PWA verification against the deployed site (GitHub Pages).
//
//   node tools/live-check.mjs [base]
//
// Phase 6 of the audit. Unlike everything else, this MUST run against the real
// deployment: the service worker is deliberately disabled on localhost, so
// offline behaviour can only be exercised on https.
//
//   1. online pass over every page → record 4xx/5xx + failed requests
//   2. assert the service worker registers and ACTIVATES
//   3. cut the network and load every page from the SW cache
//   4. About page reports the deployed version
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.argv[2] || 'https://maykeu.github.io/quranic-arabic').replace(/\/$/, '');
const OUT_DIR = 'cache/audit';
mkdirSync(OUT_DIR, { recursive: true });

const PAGES = ['index.html', 'letters.html', 'words.html', 'verses.html', 'practice.html', 'progress.html', 'about.html', 'guide.html', 'basics.html', 'roots.html'];

const PORT = 9333 + Math.floor(Math.random() * 400);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const UD = resolve(OUT_DIR, `live-profile-${PORT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(
  EDGE,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--hide-scrollbars', `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`, 'about:blank'],
  { stdio: 'ignore' },
);

const out = { base: BASE, online404: [], offline: {}, sw: {}, version: null, failures: [] };

async function getJson(p) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP unreachable');
}

try {
  await getJson('/json/version');
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    target = (await getJson('/json/list')).find((t) => t.type === 'page');
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pend = new Map();
  const events = { http4xx: [], netFail: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
      return;
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      events.http4xx.push(`${m.params.response.status} ${m.params.response.url}`);
    }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
      events.netFail.push(`${m.params.errorText} ${m.params.type}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const goto = async (url, settle = 3500) => {
    await send('Page.navigate', { url });
    await sleep(settle);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  // ---- 1. online pass: every page, watch for 4xx / failed requests ----
  for (const page of PAGES) {
    events.http4xx.length = 0;
    events.netFail.length = 0;
    await goto(`${BASE}/${page}`);
    const bodyLen = await ev('document.body.innerText.length');
    if ((events.http4xx.length || events.netFail.length) && page !== 'about.html') {
      for (const e of events.http4xx) out.failures.push(`${page}: ${e}`);
    }
    if (!bodyLen || bodyLen < 200) out.failures.push(`${page}: rendered almost nothing online (bodyLen ${bodyLen})`);
  }

  // ---- 2. service worker registration ----
  await goto(`${BASE}/index.html`, 6000);
  const swState = await ev(`(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'none';
    await navigator.serviceWorker.ready.catch(() => {});
    return (reg.active && reg.active.state) || (reg.installing && reg.installing.state) || 'registered-no-active';
  })()`);
  out.sw.state = swState;
  if (!['activated', 'activating'].includes(String(swState))) out.failures.push(`service worker not active: ${swState}`);
  // second load so the SW controls the page
  await goto(`${BASE}/index.html`, 4000);
  out.sw.controlled = await ev('!!navigator.serviceWorker.controller');

  // ---- 3. offline pass: every page must come from the cache ----
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const page of PAGES) {
    await send('Page.navigate', { url: `${BASE}/${page}` });
    await sleep(3500);
    const len = await ev('document.body.innerText.length');
    const hasMain = await ev("!!document.querySelector('main') && document.querySelector('main').innerText.length > 50");
    out.offline[page] = { bodyLen: len, main: hasMain };
    if (!hasMain) out.failures.push(`offline: ${page} did not render from cache (bodyLen ${len})`);
  }
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // ---- 4. deployed version (About card vs sw.js) ----
  await goto(`${BASE}/about.html`, 4000);
  const aboutText = await ev('document.body.innerText');
  const m = String(aboutText).match(/qa-v\d+/);
  out.version = m ? m[0] : null;
  const swSrc = await (await fetch(`${BASE}/sw.js`, { headers: { 'Cache-Control': 'no-cache' } })).text();
  const swV = (swSrc.match(/VERSION = '(qa-v\d+)'/) || [])[1];
  out.sw.version = swV;
  if (!out.version) out.failures.push('About card does not show a version');
  if (out.version !== swV) out.failures.push(`About shows ${out.version} but sw.js is ${swV}`);

  ws.close();
} catch (e) {
  out.failures.push('live-check crashed: ' + e.message);
} finally {
  edge.kill();
}

writeFileSync(`${OUT_DIR}/live-check.json`, JSON.stringify(out, null, 1));
console.log('=== live check ===');
console.log('SW:', JSON.stringify(out.sw), '| controlled:', out.sw.controlled);
for (const [p, r] of Object.entries(out.offline)) console.log(`offline ${p}: main=${r.main} bodyLen=${r.bodyLen}`);
console.log('version:', out.version, '| sw.js:', out.sw.version);
if (out.failures.length) {
  console.log(`FAILURES (${out.failures.length}):`);
  for (const f of out.failures) console.log('  ✖ ' + f);
} else {
  console.log('FAILURES: none');
}
process.exitCode = out.failures.length ? 1 : 0;
