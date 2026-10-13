// Verify every local file reference in the site exists on disk.
// Scans: HTML href/src, CSS url(), JS import specifiers + path-like literals,
// the service-worker SHELL list, and manifest icons.
// Usage: node tools/verify-links.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd());
const ROOT_ABS = ROOT.replace(/\\/g, '/');

const SKIP_DIRS = new Set(['.git', '.hermes', 'cache', 'node_modules']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p);
    } else {
      files.push(p);
    }
  }
})(ROOT);

const issues = [];
const checked = [];

function checkRef(fromFile, ref) {
  if (!ref) return;
  if (/^(https?:|mailto:|data:|#|blob:|tel:|\/\/)/.test(ref)) return;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return; // pure hash
  let target;
  if (clean.startsWith('/')) target = join(ROOT, clean.slice(1));
  else target = resolve(dirname(fromFile), clean);
  const rel = relative(ROOT, target).replace(/\\/g, '/');
  checked.push(`${fromFile.replace(/\\/g, '/')} -> ${rel}`);
  if (!existsSync(target)) {
    issues.push(`MISSING: ${fromFile.replace(/\\/g, '/')} references '${ref}' -> ${rel}`);
  }
}

// HTML
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:href|src)="([^"]+)"/g)) checkRef(f, m[1]);
}

// CSS
for (const f of files.filter((x) => x.endsWith('.css'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) checkRef(f, m[2]);
}

// JS: import specifiers + obvious path literals
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('.')) checkRef(f, m[1]);
  }
  // path-like string literals (skip dynamic ones with ${ or remote)
  for (const m of src.matchAll(/['"`]((?:assets|data|css|js|tests)\/[^'"`$]+)['"`]/g)) {
    if (m[1].includes('wbw/')) continue;
    checkRef(f, m[1]);
  }
  for (const m of src.matchAll(/['"]((?:js|css)\/[a-z0-9-]+\.(?:js|css))['"]/gi)) checkRef(f, m[1]);
}

// sw.js SHELL
{
  const f = join(ROOT, 'sw.js');
  const src = readFileSync(f, 'utf8');
  const m = src.match(/const SHELL = \[([\s\S]*?)\];/);
  if (m) {
    for (const s of m[1].matchAll(/'([^']+)'/g)) {
      const entry = s[1];
      if (entry === './' || entry === '/') continue;
      if (/^(https?:|\/\/)/.test(entry)) continue;
      checkRef(f, entry);
    }
  }
}

// manifest.json icons
{
  const f = join(ROOT, 'manifest.json');
  const man = JSON.parse(readFileSync(f, 'utf8'));
  for (const ic of man.icons || []) checkRef(f, ic.src);
  if (man.start_url) checkRef(f, man.start_url);
}

// data files referenced via loadData('x') calls (resolved against site root)
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/loadData\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    if (m[1].includes('${')) continue;
    checkRef(f, `/data/${m[1]}`);
  }
  // template-literal data refs: `quran/${...}` -> ensure directory exists
  for (const m of src.matchAll(/loadData\(\s*`([^`]+)`/g)) {
    if (m[1].includes('${')) {
      const dir = m[1].split('${')[0].replace(/\/$/, '');
      if (dir) {
        const target = join(ROOT, 'data', dir);
        if (!existsSync(target)) issues.push(`MISSING DIR: ${f.replace(/\\/g, '/')} builds data/${dir}/...`);
        checked.push(`${f.replace(/\\/g, '/')} -> data/${dir}/ (dir)`);
      }
    }
  }
}

console.log(`checked ${checked.length} references in ${files.length} files`);
if (issues.length) {
  console.log(`\nISSUES (${issues.length}):`);
  for (const i of issues) console.log('  ' + i);
  process.exit(1);
} else {
  console.log('ALL LOCAL REFERENCES RESOLVE');
}
