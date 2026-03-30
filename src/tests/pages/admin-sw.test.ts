import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const swPath = new URL('../../../public/admin-sw.js', import.meta.url);
const adminPagePath = new URL('../../../src/pages/admin/[slug]/index.astro', import.meta.url);
const adminLoginPath = new URL('../../../src/components/admin/AdminLoginForm.astro', import.meta.url);

async function readText(url: URL) {
  return fs.readFile(url, 'utf8');
}

test('admin service worker 使用版本化脚本与缓存名，避免长期命中旧后台资源', async () => {
  const [swCode, adminPageCode, adminLoginCode] = await Promise.all([
    readText(swPath),
    readText(adminPagePath),
    readText(adminLoginPath),
  ]);

  assert.match(swCode, /searchParams\.get\('v'\)/);
  assert.match(swCode, /const CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{[^`]+\}`;/);
  assert.doesNotMatch(swCode, /const CACHE_NAME = `\$\{CACHE_PREFIX\}1`;/);
  assert.match(adminPageCode, /serviceWorker=\{`\/admin-sw\.js\?v=\$\{encodeURIComponent\(APP_VERSION\)\}`\}/);
  assert.match(adminLoginCode, /register\('\/admin-sw\.js\?v=' \+ encodeURIComponent\(appVersion\)/);
});
