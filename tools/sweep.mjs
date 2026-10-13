// Full site sweep over CDP in a real browser.
//
//   node tools/sweep.mjs [baseUrl]
//
// For every page: loads it, records console errors / uncaught exceptions /
// failed requests / 4xx-5xx responses, checks horizontal overflow at three
// phone widths, verifies both themes render, clicks every SAFE control
// (buttons + in-page hash links) and records whether anything happened, and
// drives every hash route the app supports, asserting a route-specific marker.
//
// Hard failures: exceptions, failed requests, 4xx+, no navigation target.
// Soft list   : controls that produced no observable change (reviewed by hand).
// Report      : cache/audit/sweep-report.json (plus a summary on stdout).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8080';
const ONLY = process.argv[3] || '';
const OUT_DIR = 'cache/audit';
mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  'index.html',
  'letters.html',
  'words.html',
  'verses.html',
  'practice.html',
  'progress.html',
  'about.html',
  'guide.html',
  'basics.html',
  'roots.html',
];

// Route checks: [hash, markerSelectorOrText, note]
const ROUTES = {
  'words.html': [
    ['#browse', '.word-row', 'browse list'],
    ['#review', '.stats-row', 'review stats'],
    ['#review/b12', '.stats-row', 'box-filtered review'],
    ['#build', '#go', 'build game (start card)'],
  ],
  'practice.html': [
    ['#read', '.pr-card', 'read aloud'],
    ['#trace', '#trace-slot', 'trace'],
    ['#listen', '.listen-word', 'listen'],
    ['#quiz', '.quiz-seg', 'quiz'],
    ['#recall', '.seg', 'recall'],
  ],
  'progress.html': [
    ['#overview', '.goal-line', 'overview'],
    ['#stats', '.drill-table', 'stats'],
    ['#memorised', 'section.card', 'memorised'],
    ['#data', '#export', 'data'],
  ],
  'verses.html': [
    ['#1', '.ayah', 'surah 1'],
    ['#2:255', '.ayah', 'deep-link ayah'],
  ],
};

// Controls that must never be clicked by an automated sweep.
const SKIP_IDS = new Set(['reset', 'do-reset', 'acc-out', 'import', 'export', 'do-import']);
const SKIP_HINT = /(reset|sign out|import|export|backup|delete|erase|sign-in|acc-signin|acc-|chip-x|google|oauth)/i;

const PORT = 9333 + Math.floor(Math.random() * 400);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Edge requires an ABSOLUTE --user-data-dir; a relative one makes it exit at once
// (which then looks exactly like "CDP unreachable").
const UD = resolve(OUT_DIR, `sweep-profile-${PORT}`);

// Kill the WHOLE browser tree: child.kill() only stops the launcher, and the
// renderer/GPU children keep the profile dir locked for the next run.
const killEdge = () => {
  try { edge.kill(); } catch {}
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(
  EDGE,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--hide-scrollbars', `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`, 'about:blank'],
  { stdio: 'ignore' },
);

const die = (m) => {
  console.error('FATAL: ' + m);
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
  throw new Error('CDP unreachable');
}

const report = { base: BASE, pages: {}, failures: [], soft: [] };

try {
  await getJson('/json/version');
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    target = (await getJson('/json/list')).find((t) => t.type === 'page');
    if (!target) await sleep(250);
  }
  if (!target) die('no page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const events = { exceptions: [], consoleErrors: [], netFail: [], http4xx: [] };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      events.exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      events.consoleErrors.push(m.params.args.map((a) => a.value || a.description || a.type).join(' ').slice(0, 200));
    }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
      events.netFail.push(`${m.params.type} ${m.params.errorText}`.slice(0, 160));
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      events.http4xx.push(`${m.params.response.status} ${m.params.response.url.slice(0, 120)}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      return { __error: (d.exception && (d.exception.description || d.exception.value)) || d.text };
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const clearEvents = () => {
    events.exceptions.length = 0;
    events.consoleErrors.length = 0;
    events.netFail.length = 0;
    events.http4xx.length = 0;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  const goto = async (url, settle = 2400) => {
    await send('Page.navigate', { url });
    await sleep(settle);
  };

  for (const page of PAGES.filter((p) => !ONLY || p === ONLY)) {
    const url = `${BASE}/${page}`;
    clearEvents();
    await goto(url);
    await evalJs("try { localStorage.clear(); } catch (e) {}");

    const rec = { url, ok: true, overflow: {}, controls: {}, routes: {}, notes: [] };

    // ---------- overflow at three phone widths ----------
    for (const width of [360, 430, 520]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: true });
      await sleep(350);
      const res = await evalJs(`(() => {
        const vw = window.innerWidth;
        const doc = document.documentElement;
        if (doc.scrollWidth <= vw + 2) return null;
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > vw + 2 && el.offsetParent !== null)
          .slice(0, 6)
          .map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0,2).join('.') : ''));
        return { vw, scrollWidth: doc.scrollWidth, wide };
      })()`);
      if (res && res.scrollWidth) {
        rec.overflow[width] = res;
        report.failures.push(`${page}: horizontal overflow at ${width}px (scrollWidth ${res.scrollWidth}) → ${res.wide.join(', ')}`);
      }
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 520, height: 900, deviceScaleFactor: 2, mobile: true });
    await sleep(300);

    // ---------- both themes render ----------
    const themeCheck = await evalJs(`(() => {
      const out = {};
      for (const t of ['dark', 'light']) {
        document.documentElement.setAttribute('data-theme', t);
        const bg = getComputedStyle(document.body).backgroundColor;
        out[t] = { bg, text: document.body.innerText.length };
      }
      document.documentElement.setAttribute('data-theme', '');
      return out;
    })()`);
    if (!themeCheck || themeCheck.dark.text < 200 || themeCheck.dark.bg === themeCheck.light.bg) {
      report.failures.push(`${page}: theme render check suspicious → ${JSON.stringify(themeCheck)}`);
    }

    // ---------- click every safe control ----------
    await goto(url); // fresh state for interaction
    const controls = await evalJs(`(() => {
      const list = [...document.querySelectorAll('button, a[href^="#"], [role="button"]')]
        .filter((el) => el.offsetParent !== null && !el.disabled)
        .map((el, i) => {
          el.setAttribute('data-sweep', String(i));
          return {
            i,
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            cls: String(el.className || '').split(' ').slice(0, 2).join(' '),
            text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28),
          };
        });
      return list;
    })()`);

    const injectIds = () =>
      evalJs(`[...document.querySelectorAll('button, a[href^="#"], [role="button"]')].forEach((el, i) => el.setAttribute('data-sweep', String(i)))`);

    const seen = new Set();
    let clicked = 0;
    let skipped = 0;
    let noEffect = [];
    for (const c of controls || []) {
      const sig = `${c.tag}|${c.id}|${c.cls}|${c.text}`.replace(/\d+/g, '#');
      if (seen.has(sig)) continue; // one representative per distinct control
      seen.add(sig);
      if (clicked >= 40) break;
      if (c.id && SKIP_IDS.has(c.id)) continue;
      if (SKIP_HINT.test(c.id) || SKIP_HINT.test(c.cls)) continue;
      if (/sign in|continue with google/i.test(c.text)) continue;
      clearEvents();
      const res = await evalJs(`(async () => {
        window.__mut = 0;
        if (!window.__obs) {
          window.__obs = new MutationObserver((ms) => { window.__mut += ms.length; });
          window.__obs.observe(document.body, { childList: true, subtree: true, attributes: true });
        }
        const beforeHref = location.href;
        const beforeHash = location.hash;
        // Resolve by FINGERPRINT (id, else tag+text), never by index: an earlier
        // click can re-render and shift indices, which once aimed a "safe" click
        // straight at "Continue with Google" and left the tab on accounts.google.com.
        const want = { id: ${JSON.stringify(c.id)}, tag: ${JSON.stringify(c.tag)}, text: ${JSON.stringify(c.text)} };
        let el = want.id ? document.getElementById(want.id) : null;
        if (el && el.tagName.toLowerCase() !== want.tag) el = null;
        if (!el) {
          const cands = [...document.querySelectorAll('button, a[href^="#"], [role="button"]')];
          el = cands.find((x) => x.tagName.toLowerCase() === want.tag && (x.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28) === want.text) || null;
        }
        if (!el) return { missingBefore: true };
        try { el.click(); } catch (e) { return { throw: String(e) }; }
        await new Promise((r) => setTimeout(r, 420));
        return {
          hash: location.hash,
          hashChanged: location.hash !== beforeHash,
          nav: location.href !== beforeHref,
          escaped: (() => { try { return new URL(location.href).origin !== new URL(${JSON.stringify(BASE)}).origin; } catch { return false; } })(),
          mut: window.__mut,
          existsNow: !!(want.id ? document.getElementById(want.id) : el.isConnected),
        };
      })()`);
      const label = `${c.tag}${c.id ? '#' + c.id : ''}${c.cls ? '.' + c.cls.replace(/ /g, '.') : ''} "${c.text}"`;
      if (res && res.missingBefore) {
        skipped += 1; // an earlier re-render moved the DOM on; not evidence either way
        continue;
      }
      clicked += 1;
      if (res && res.throw) report.failures.push(`${page}: clicking ${label} threw → ${res.throw}`);
      if (res && res.escaped) {
        report.failures.push(`${page}: clicking ${label} left the site (now on ${'a foreign origin'}) — swept back`);
        await goto(url);
        continue;
      }
      if (res && res.nav) {
        rec.notes.push(`${label} navigated`);
        await goto(url); // controls were re-created; re-inject ids
        await injectIds();
        continue;
      }
      const effect = res && (res.mut > 0 || res.hashChanged || !res.existsNow);
      if (!effect) noEffect.push(label);
      if (events.exceptions.length) report.failures.push(`${page}: clicking ${label} threw (console) → ${events.exceptions[0].slice(0, 120)}`);
    }
    rec.controls = { clicked, skipped, noEffect };
    if (noEffect.length) report.soft.push(`${page}: ${noEffect.length} control(s) with no observable change → ${noEffect.join(' | ')}`);

    // ---------- every hash route ----------
    if (process.env.SWEEP_DEBUG) {
      const st = await evalJs(`JSON.stringify({href: location.href, hash: location.hash, ready: document.readyState, mainLen: (document.querySelector('main')||{}).innerHTML?.length, bodyLen: document.body.innerText.length})`);
      console.log(`  [debug before routes] ${st}`);
    }
    for (const [hash, marker, note] of ROUTES[page] || []) {
      clearEvents();
      await evalJs(`location.hash = '${hash}'`);
      // Poll for the marker (surah data is fetched async; a fixed wait made this
      // flaky on a cold server). Up to ~7 s, then it is a real failure.
      const probe = marker.startsWith('text:')
        ? `document.body.innerText.includes(${JSON.stringify(marker.slice(5))})`
        : `!!document.querySelector('${marker}')`;
      let found = false;
      for (let attempt = 0; attempt < 18 && !found; attempt++) {
        await sleep(400);
        found = !!(await evalJs(probe));
      }
      rec.routes[hash] = { marker, found, note };
      if (!found) report.failures.push(`${page}: route ${hash} (${note}) → marker '${marker}' not found`);
      if (events.exceptions.length) report.failures.push(`${page}: route ${hash} threw → ${events.exceptions[0].slice(0, 120)}`);
    }

    // ---------- page-load event health ----------
    if (events.http4xx.length) report.failures.push(`${page}: HTTP 4xx+ during pass → ${events.http4xx.join(' | ')}`);
    if (events.netFail.length) report.failures.push(`${page}: failed requests → ${events.netFail.join(' | ')}`);
    if (events.exceptions.length) report.failures.push(`${page}: uncaught exceptions → ${events.exceptions.join(' | ')}`);

    report.pages[page] = rec;
    console.log(`swept ${page}: controls=${clicked} noEffect=${noEffect.length} routes=${Object.keys(rec.routes).length}`);
  }

  ws.close();
} catch (e) {
  report.failures.push('sweep crashed: ' + e.message);
} finally {
  killEdge();
}

writeFileSync(`${OUT_DIR}/sweep-report.json`, JSON.stringify(report, null, 1));
console.log('\n===== sweep verdict =====');
if (report.failures.length) {
  console.log(`FAILURES (${report.failures.length}):`);
  for (const f of report.failures.slice(0, 40)) console.log('  ✖ ' + f);
} else {
  console.log('FAILURES: none');
}
if (report.soft.length) {
  console.log(`\nREVIEW (${report.soft.length}):`);
  for (const s of report.soft) console.log('  · ' + s);
}
console.log('\nreport:', `${OUT_DIR}/sweep-report.json`);
process.exitCode = report.failures.length ? 1 : 0;
