import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..');
const ADMIN_API_ROOT = join(REPO_ROOT, 'src', 'pages', 'api', 'admin');

const SKIP_PROXY_ENFORCEMENT = new Set([
  // Not admin upstream proxies (cookie set/clear)
  'src/pages/api/admin/login.ts',
  'src/pages/api/admin/logout.ts',

  // Special-case routes that intentionally don't use proxyAdminRequest
  // (but must still avoid hand-rolled auth parsing).
  'src/pages/api/admin/orders.ts',
  'src/pages/api/admin/customers/export.ts',
  'src/pages/api/admin/localize-images.ts',
  'src/pages/api/admin/localize-images-batch.ts',
]);

const MANUAL_AUTH_PATTERNS = [
  // Match both Authorization and authorization casing.
  {
    id: 'authorization header',
    re: /request\.headers\.get\(\s*['\"]authorization['\"]\s*\)/i,
  },

  // Catch both cookies.get('admin_token') and cookies?.get?.('admin_token') forms.
  {
    id: 'admin_token cookie get',
    re: /cookies\s*(?:\?\.)?get(?:\?\.)?\(\s*['\"]admin_token['\"]\s*\)/,
  },
];

function toPosix(p) {
  return String(p).split('\\').join('/');
}

async function walk(dirAbs) {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const e of entries) {
    const abs = join(dirAbs, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(abs)));
      continue;
    }
    if (e.isFile() && e.name.endsWith('.ts')) {
      files.push(abs);
    }
  }
  return files;
}

test('admin api routes: should not hand-roll auth parsing; should use proxyAdminRequest', async () => {
  const absFiles = await walk(ADMIN_API_ROOT);

  const hits = [];
  for (const abs of absFiles) {
    const rel = toPosix(relative(REPO_ROOT, abs));

    const content = await readFile(abs, 'utf8');

    // Always enforce: no hand-rolled admin auth parsing.
    for (const pat of MANUAL_AUTH_PATTERNS) {
      if (pat.re.test(content)) {
        hits.push({ rel, kind: pat.id });
      }
    }

    // Enforce proxyAdminRequest() for normal proxy routes.
    // (Special-case routes are exempt from proxyAdminRequest enforcement only.)
    if (!SKIP_PROXY_ENFORCEMENT.has(rel)) {
      if (!/proxyAdminRequest\s*\(/.test(content)) {
        hits.push({ rel, kind: 'missing proxyAdminRequest()' });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits
    .slice(0, 80)
    .map((h) => `- ${h.kind}\t${h.rel}`)
    .join('\n');
  const suffix = hits.length > 80 ? `\n... and ${hits.length - 80} more` : '';

  assert.fail(`Admin API route unification violations found:\n${preview}${suffix}`);
});
