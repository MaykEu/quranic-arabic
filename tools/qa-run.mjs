// Batch-run every QA battery in tests/*.html in a real browser (real time —
// several of them cannot run under virtual time) and print one table.
//
//   node tools/qa-run.mjs [substring filter] [baseUrl]
//
// Waits are per-file because the batteries differ hugely in runtime; every run
// gets a FRESH browser profile so localStorage starts clean. Results land in
// cache/audit/qa-run.json. A battery passes when its <body data-qa> is
// "done-pass"; "done-fail" shows the failing booleans, "done-error" the throw.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FILTER = process.argv[2] || '';
const FILTERS = FILTER.split(',').map((f) => f.trim()).filter(Boolean);
const BASE = process.argv[3] || 'http://localhost:8080';
const OUT_DIR = 'cache/audit';
mkdirSync(OUT_DIR, { recursive: true });

// wait ms per battery (overrides default), tuned to each battery's own sleeps
const WAITS = {
  'sound-qa.html': 130000,
  'progress-qa.html': 75000,
  'sync-qa.html': 60000,
  'verses-play-qa.html': 70000,
  'persistence-qa.html': 30000,
  'account-qa.html': 45000,
  'backup-qa.html': 40000,
  'memorise-qa.html': 90000,
  'recall-tab-qa.html': 35000,
  'quiz-fit-qa.html': 45000,
  'practice-picker-qa.html': 40000,
  'build-play-qa.html': 45000,
  'audio-probe.html': 60000,
  'letters-audition.html': 30000,
  'letters-quiz-qa.html': 60000,
  'trace-check.html': 35000,
  'roots-qa.html': 35000,
  'basics-qa.html': 30000,
  'build-qa.html': 30000,
  'practice-listen-qa.html': 40000,
  'smoke.html': 25000,
};
const DEFAULT_WAIT = 30000;

const files = readdirSync('tests')
  .filter((f) => f.endsWith('.html') && (!FILTERS.length || FILTERS.some((s) => f.includes(s))))
  .sort();

const PORT = 9333 + Math.floor(Math.random() * 400);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const UD = resolve(OUT_DIR, `qa-run-profile-${PORT}`);

// Kill the WHOLE browser tree: child.kill() only stops the launcher, and the
// renderer/GPU children keep the profile dir locked for the next run.
const killEdge = () => {
  try { edge.kill(); } catch {}
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(
  EDGE,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', `--user-data-dir=${UD}`, `--remote-debugging-port=${PORT}`, 'about:blank'],
  { stdio: 'ignore' },
);

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

const results = [];
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
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
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
  await send('Runtime.enable');
  await send('Page.enable');
  // clear the profile's storage once — every battery seeds its own state
  await send('Page.navigate', { url: `${BASE}/tests/smoke.html` });
  await sleep(1500);
  await ev('localStorage.clear()');

  // Batteries that are not a plain data-qa="done-pass" boolean:
  //   smoke.html          needs its Run button clicked, then reads PASS/FAIL lines
  //   basics-qa.html      reports values (data-qa="done"); assertions are semantic
  //   build-play-qa.html  a driver: ?mode=mid|done|race, reports "mid:…"/"done:…"
  //   letters-audition    an EAR-CHECK page for Mayk — nothing to assert
  const MANUAL = new Set(['letters-audition.html']);
  const parseJson = (txt) => {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  };

  async function runFile(file) {
    const wait = WAITS[file] || DEFAULT_WAIT;
    const url = `${BASE}/tests/${file}`;

    if (file === 'smoke.html') {
      await send('Page.navigate', { url });
      await sleep(2000);
      await ev("document.getElementById('run') && document.getElementById('run').click()");
      await sleep(3000);
      const txt = await ev("(document.getElementById('out') || {}).innerText || ''");
      const fails = (txt.match(/^FAIL.*$/gm) || []).length;
      const passes = (txt.match(/^PASS.*$/gm) || []).length;
      return { marker: passes > 0 && fails === 0 ? 'done-pass' : fails ? 'done-fail' : 'no-marker', detail: fails ? txt.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 4).join(' | ') : `${passes} checks passed` };
    }

    if (file === 'basics-qa.html') {
      await send('Page.navigate', { url });
      await sleep(wait);
      const txt = await ev("(document.getElementById('result') || {}).textContent || ''");
      const o = parseJson(txt) || {};
      const ok = o.ribbon === 'كتب' && o.afterUndo === 'كت' && o.afterClear === true && Array.isArray(o.chips) && o.chips.length >= 3;
      return { marker: ok ? 'done-pass' : 'done-fail', detail: ok ? '' : JSON.stringify(o).slice(0, 220) };
    }

    if (file === 'build-play-qa.html') {
      const problems = [];
      const seen = [];
      for (const mode of ['mid', 'done', 'race']) {
        await send('Page.navigate', { url: `${url}?mode=${mode}` });
        await sleep(22000);
        const marker = await ev('document.body.dataset.qa || "no-marker"');
        seen.push(`${mode}→${marker}`);
        if (mode === 'mid' && !(/^mid:/.test(marker) && Number((marker.match(/placed=(\d+)/) || [])[1]) >= 2)) problems.push(marker);
        if (mode === 'done' && !(/^done:/.test(marker) && /success=true/.test(marker))) problems.push(marker);
        if (mode === 'race' && /^error:/.test(marker)) problems.push(marker);
      }
      return { marker: problems.length ? 'done-fail' : 'done-pass', detail: problems.length ? problems.join(' | ') : seen.join('  ') };
    }

    if (file === 'practice-listen-qa.html') {
      await send('Page.navigate', { url });
      await sleep(wait);
      const txt = await ev("(document.getElementById('trace') || {}).textContent || ''");
      const o = parseJson(txt) || {};
      const ok = typeof o.mismatches === 'number' && o.mismatches === 0 && Array.isArray(o.pairs) && o.pairs.length >= 10;
      return { marker: ok ? 'done-pass' : 'done-fail', detail: ok ? `${o.pairs.length} word/audio pairs matched` : `mismatches: ${o.mismatches ?? '?'}` };
    }

    await send('Page.navigate', { url });
    await sleep(wait);
    const marker = await ev('document.body.dataset.qa || "no-marker"');
    // A few batteries use "done" for pass and their own word for failure.
    if (marker === 'done' && file === 'build-qa.html') return { marker: 'done-pass', detail: '' };
    if (marker === 'fail') return { marker: 'done-fail', detail: 'reported fail' };
    let detail = '';
    if (marker === 'done-fail' || marker === 'done-error') {
      detail = await ev(`(() => {
        const pre = document.getElementById('result');
        if (!pre) return 'no result element';
        try {
          const o = JSON.parse(pre.textContent);
          const bad = Object.entries(o).filter(([, v]) => v === false).map(([k]) => k);
          return bad.length ? 'failed: ' + bad.join(', ') : pre.textContent.slice(0, 300);
        } catch { return pre.textContent.slice(0, 300); }
      })()`);
    }
    return { marker, detail };
  }

  for (const file of files) {
    const { marker, detail } = await runFile(file);
    const shown = MANUAL.has(file) ? 'MANUAL' : marker === 'done-pass' ? 'PASS' : marker.toUpperCase();
    results.push({ file, marker, detail, manual: MANUAL.has(file) });
    console.log(`${shown}  ${file}${detail ? '  → ' + detail : ''}`);
  }
  ws.close();
} catch (e) {
  console.error('RUNNER ERROR: ' + e.message);
} finally {
  killEdge();
}

const judged = results.filter((r) => !r.manual);
const pass = judged.filter((r) => r.marker === 'done-pass').length;
console.log(`\n${pass}/${judged.length} batteries passed${results.length > judged.length ? ` (+${results.length - judged.length} manual/informational)` : ''}`);
writeFileSync(`${OUT_DIR}/qa-run.json`, JSON.stringify({ base: BASE, filter: FILTER, results }, null, 1));
console.log('report: cache/audit/qa-run.json');
process.exitCode = pass === judged.length && judged.length > 0 ? 0 : 1;
