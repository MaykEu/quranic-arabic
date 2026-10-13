// Real-time headless driver (Edge + CDP): load a URL, wait, evaluate JS, and
// optionally capture a full-page screenshot.
//
//   node tools/cdp.mjs <url> <waitMs> <jsExpr> [shotPath]
//
// Why this exists: some QA pages (file imports via File.text(), real timers)
// must run under REAL time — --virtual-time-budget breaks them, and --dump-dom
// dumps before their async work finishes. --timeout is ignored by new headless.
import { spawn } from 'node:child_process';

const [url, waitMs = '8000', expr = 'document.body.dataset.qa', shotPath = ''] = process.argv.slice(2);
if (!url) {
  console.error('usage: node tools/cdp.mjs <url> <waitMs> <jsExpr> [shotPath]');
  process.exit(2);
}

const PORT = 9333 + Math.floor(Math.random() * 400);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const UD = `C:/Users/sofia/Documents/Islam/Quranic Arabic/cache/qa/cdp-${PORT}`;

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    `--user-data-dir=${UD}`,
    `--remote-debugging-port=${PORT}`,
    url,
  ],
  { stdio: 'ignore' },
);

// Kill the WHOLE browser tree: child.kill() only stops the launcher, and the
// renderer/GPU children keep the profile dir locked for the next run.
const killEdge = () => {
  try { edge.kill(); } catch {}
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => {
  console.error('ERROR: ' + msg);
  killEdge();
  process.exit(1);
};

async function getJson(path) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP endpoint not reachable');
}

let ws;
try {
  await getJson('/json/version');
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    const list = await getJson('/json/list');
    page = list.find((t) => t.type === 'page' && /^https?:/.test(t.url));
    if (!page) await sleep(250);
  }
  if (!page) die('no page target');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(Number(waitMs));

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const val = r.result && r.result.result ? r.result.result.value : null;
  if (r.result && r.result.exceptionDetails) {
    console.log('EXCEPTION: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description));
  } else {
    console.log(typeof val === 'string' ? val : JSON.stringify(val, null, 1));
  }

  if (shotPath) {
    const m = await send('Emulation.setDeviceMetricsOverride', {
      width: 520,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: true,
    });
    if (m.error) console.error('metrics: ' + m.error.message);
    await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (shot.result && shot.result.data) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
      console.log('SHOT: ' + shotPath);
    } else {
      console.error('SHOT FAILED: ' + JSON.stringify(shot.error || shot));
    }
  }
} catch (e) {
  die(e.message);
} finally {
  if (ws) try { ws.close(); } catch {}
  killEdge();
}
