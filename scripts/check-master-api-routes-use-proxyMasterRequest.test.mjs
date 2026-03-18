import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');
const MASTER_API_ROOT = join(REPO_ROOT, 'src', 'pages', 'api', 'master');

const SKIP_FILES = new Set([
  // These routes intentionally manage cookies / auth lifecycle.
  'src/pages/api/master/login.ts',
  'src/pages/api/master/logout.ts',
  'src/pages/api/master/impersonate-shop.ts',
]);

function toPosix(p) {
  return String(p).split('\\').join('/');
}

async function walk(dirAbs) {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const abs = join(dirAbs, e.name);
    if (e.isDirectory()) files.push(...(await walk(abs)));
    else if (e.isFile() && e.name.endsWith('.ts')) files.push(abs);
  }
  return files;
}

test('master api routes: should use proxyMasterRequest helper', async () => {
  const absFiles = await walk(MASTER_API_ROOT);

  const hits = [];
  for (const abs of absFiles) {
    const rel = toPosix(relative(REPO_ROOT, abs));
    if (SKIP_FILES.has(rel)) continue;

    const content = await readFile(abs, 'utf8');

    // No more inline resolveMasterAuth glue in route bodies.
    if (/resolveMasterAuth\s*\(/.test(content)) {
      hits.push({ rel, kind: 'inline resolveMasterAuth()' });
    }

    if (!/proxyMasterRequest\s*\(/.test(content)) {
      hits.push({ rel, kind: 'missing proxyMasterRequest()' });
    }
  }

  if (hits.length === 0) return;
  const preview = hits
    .slice(0, 80)
    .map((h) => `- ${h.kind}\t${h.rel}`)
    .join('\n');
  const suffix = hits.length > 80 ? `\n... and ${hits.length - 80} more` : '';
  assert.fail(`Master API route unification violations found:\n${preview}${suffix}`);
});
