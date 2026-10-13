// Static integrity audit — re-runnable, zero dependencies.
//
//   node tools/audit-static.mjs
//
// Checks:
//   1. Orphan files: shipped files nothing references (html/js/css/sw/manifest),
//      with pattern-aware whitelists for dynamically loaded sets (per-surah data,
//      letter audio, icons, fonts).
//   2. Debug leftovers in shipped JS: console.log/debug/info, debugger, TODO/FIXME.
//   3. Duplicate component definitions across stylesheets (informational — a class
//      defined in several sheets is how the ".seg not linked" bug happened).
//   4. Internal link targets: every href/src in every html page resolves.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', 'cache', '.hermes', 'node_modules']);
const problems = [];
const notes = [];

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!skipDirs.has(name)) walk(p, out);
    } else out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => readFileSync(p, 'utf8');

const all = walk(ROOT);
const shipped = all.filter((p) => !/^(tools|tests|docs)\//.test(rel(p)) && !/\.(md|cmd|json)$/.test(rel(p)) || /^(manifest\.json|package\.json)$/.test(rel(p)));

// ---------- 1. orphan files ----------
// Build one big "referenced" haystack from html/js/css/sw/manifest.
const refFiles = all.filter((p) => /\.(html|js|css|json)$/.test(p) && !/^(cache|tools|tests|docs)\//.test(rel(p)));
let hay = '';
for (const p of refFiles) hay += '\n' + read(p);

const DYNAMIC_WHITELIST = [
  /^data\/quran\/\d{3}\.json$/, // loaded by tools + loadData('quran/<pad>.json') via index.json
  /^data\/quran\/index\.json$/,
  /^assets\/audio\/letters\/.+\.mp3$/, // built from data/letters.json ids
  /^assets\/audio\/audition\/.+\.mp3$/, // linked from tests/letters-audition.html
  /^assets\/icons\/.+\.(png|ico|svg)$/, // manifest.json + favicon
  /^assets\/fonts\/.+\.(woff2|woff|ttf|otf)$/, // css @font-face
  /^assets\/audio\/CREDITS\.md$/,
];
const skipTop = /^(README\.md|LICENSE|package\.json|start-server\.cmd|\.nojekyll|manifest\.json|sw\.js|docs\/|tools\/|tests\/|crash|\.git)/;

const orphans = [];
for (const p of shipped) {
  const r = rel(p);
  if (skipTop.test(r)) continue;
  if (DYNAMIC_WHITELIST.some((re) => re.test(r))) continue;
  if (!hay.includes(r) && !hay.includes(r.replace(/^\.\//, ''))) {
    // also try without extension (e.g. loadData('vocabulary.json'))
    const base = r.split('/').pop();
    if (base && hay.includes(base)) continue;
    orphans.push(r);
  }
}
if (orphans.length) problems.push(`orphan files (nothing references them):\n    ${orphans.join('\n    ')}`);

// ---------- 2. debug leftovers in shipped JS ----------
const jsFiles = all.filter((p) => p.endsWith('.js') && !/^(tools|tests|cache)\//.test(rel(p)));
const leftovers = [];
for (const p of jsFiles) {
  const src = read(p);
  src.split('\n').forEach((line, i) => {
    if (/console\.(log|debug|info)\s*\(/.test(line) || /\bdebugger\b/.test(line)) {
      leftovers.push(`${rel(p)}:${i + 1} ${line.trim().slice(0, 90)}`);
    }
  });
}
if (leftovers.length) problems.push(`debug leftovers:\n    ${leftovers.join('\n    ')}`);

// TODO / FIXME are review notes, not errors
const todos = [];
for (const p of [...jsFiles, ...all.filter((q) => q.endsWith('.css'))]) {
  read(p).split('\n').forEach((line, i) => {
    if (/\b(TODO|FIXME|XXX)\b/.test(line)) todos.push(`${rel(p)}:${i + 1} ${line.trim().slice(0, 80)}`);
  });
}
if (todos.length) notes.push(`TODO/FIXME markers (review):\n    ${todos.join('\n    ')}`);

// ---------- 3. duplicate class definitions across stylesheets ----------
const cssFiles = all.filter((p) => p.endsWith('.css') && rel(p).startsWith('css/'));
const defs = new Map(); // class -> [files]
for (const p of cssFiles) {
  for (const line of read(p).split('\n')) {
    const m = line.match(/^\.([a-zA-Z][\w-]*)\s*[,{]/);
    if (!m) continue;
    const cls = m[1];
    if (!defs.has(cls)) defs.set(cls, new Set());
    defs.get(cls).add(rel(p));
  }
}
const dupes = [...defs.entries()].filter(([, files]) => files.size > 1).map(([cls, files]) => `${cls} → ${[...files].join(', ')}`);
notes.push(`class pickers defined in >1 stylesheet (${dupes.length}):\n    ${dupes.join('\n    ')}`);

// ---------- 4. internal link targets ----------
const htmlFiles = all.filter((p) => p.endsWith('.html'));
const broken = [];
for (const p of htmlFiles) {
  const src = read(p);
  const refs = [...src.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:|#|javascript:)/.test(ref)) continue;
    const [pathPart] = ref.split(/[?#]/);
    if (!pathPart) continue;
    // Page-relative first, then site-root-relative (test drivers reference site
    // paths like words.html from /tests/; that is correct on the live site).
    const target = resolve(dirname(p), pathPart);
    const rootTarget = resolve(ROOT, pathPart);
    if (!existsSync(target) && !existsSync(rootTarget)) broken.push(`${rel(p)} → ${ref}`);
  }
}
if (broken.length) problems.push(`broken html refs:\n    ${broken.join('\n    ')}`);

// ---------- report ----------
console.log('=== static audit ===');
console.log('shipped files scanned:', shipped.length, '| js:', jsFiles.length, '| css:', cssFiles.length, '| html:', htmlFiles.length);
if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log('  ✖ ' + p);
} else {
  console.log('\nPROBLEMS: none');
}
if (notes.length) {
  console.log('\nNOTES (informational):');
  for (const n of notes) console.log('  · ' + n);
}
process.exitCode = problems.length ? 1 : 0;
