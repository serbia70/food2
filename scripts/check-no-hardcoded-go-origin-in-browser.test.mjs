import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT = join(__dirname, '..');

const SCAN_ROOTS = [
  join(PROJECT, 'src', 'pages'),
  join(PROJECT, 'src', 'components'),
  join(PROJECT, 'src', 'scripts'),
];

const EXCLUDED_ROOT = join(PROJECT, 'src', 'pages', 'api');

const ALLOWED_EXTS = new Set(['.astro', '.ts', '.tsx']);

function toPosixPath(p) {
  return p.replaceAll('\\\\', '/');
}

function extnameLite(p) {
  const i = p.lastIndexOf('.');
  return i === -1 ? '' : p.slice(i);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const out = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (abs.startsWith(EXCLUDED_ROOT)) continue;

    if (entry.isDirectory()) {
      out.push(...(await walk(abs)));
      continue;
    }

    if (entry.isFile() && ALLOWED_EXTS.has(extnameLite(abs))) out.push(abs);
  }
  return out;
}

test('browser-facing code must not hardcode Go origin (proxy-only)', async () => {
  // Keep the scan limited to src/{pages,components,scripts}/**. Do NOT scan dist/node_modules.
  const files = [];
  for (const root of SCAN_ROOTS) files.push(...(await walk(root)));

  const hits = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    if (src.includes('api.serbia70.com')) hits.push(toPosixPath(relative(PROJECT, file)));
  }

  assert.deepEqual(hits, [], `found hardcoded Go origin in browser-facing code:\n${hits.join('\n')}`);
});
