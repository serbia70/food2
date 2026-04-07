import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const swPath = new URL('../../../public/admin-sw.js', import.meta.url);
const adminPagePath = new URL('../../../src/pages/admin/[slug]/index.astro', import.meta.url);
const adminLoginPath = new URL('../../../src/components/admin/AdminLoginForm.astro', import.meta.url);
const configPath = new URL('../../../src/config.ts', import.meta.url);

async function readText(url: URL) {
  return fs.readFile(url, 'utf8');
}

test('admin service worker 使用版本化脚本与缓存名，避免长期命中旧后台资源', async () => {
  const [swCode, adminPageCode, adminLoginCode, configCode] = await Promise.all([
    readText(swPath),
    readText(adminPagePath),
    readText(adminLoginPath),
    readText(configPath),
  ]);

  assert.match(swCode, /searchParams\.get\('v'\)/);
  assert.match(swCode, /const CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{[^`]+\}`;/);
  assert.doesNotMatch(swCode, /const CACHE_NAME = `\$\{CACHE_PREFIX\}1`;/);
  assert.match(configCode, /export const APP_VERSION = String\(Date\.now\(\)\);/);
  assert.match(adminPageCode, /const adminServiceWorker = import\.meta\.env\.DEV \? undefined : `\/admin-sw\.js\?v=\$\{encodeURIComponent\(APP_VERSION\)\}`;/);
  assert.match(adminPageCode, /serviceWorker=\{adminServiceWorker\}/);
  assert.match(adminLoginCode, /register\('\/admin-sw\.js\?v=' \+ encodeURIComponent\(appVersion\)/);
});

test('admin service worker 不缓存 404 导航页，避免刷新时反复命中坏页面', async () => {
  const swCode = await readText(swPath);

  assert.match(swCode, /if \(request\.mode === 'navigate' && inScope\)/);
  assert.match(swCode, /if \(response\.ok\) \{/);
  assert.match(swCode, /cache\.put\(request, cloned\)/);
  assert.doesNotMatch(swCode, /fetch\(request\)\s*\.then\(\(response\) => \{\s*const cloned = response\.clone\(\);\s*caches\.open\(CACHE_NAME\)\.then\(\(cache\) => cache\.put\(request, cloned\)\);\s*return response;\s*\}\)/s);
});

test('admin service worker 激活时清理 scope 下旧导航缓存，避免继续回放历史 404 页面', async () => {
  const swCode = await readText(swPath);

  assert.match(swCode, /const staleNavigationKeys = \[scopePath, `\$\{scopePath\}\/`\];/);
  assert.match(swCode, /cache\.delete\(key\)/);
  assert.match(swCode, /Promise\.all\(staleNavigationKeys\.map\(\(key\) => cache\.delete\(key\)\)\)/);
});

test('admin 页面与登录页在开发环境主动注销旧 service worker，避免旧脚本继续接管', async () => {
  const [adminPageCode, adminLoginCode] = await Promise.all([
    readText(adminPagePath),
    readText(adminLoginPath),
  ]);

  assert.match(adminPageCode, /const adminServiceWorker = import\.meta\.env\.DEV \? undefined : `\/admin-sw\.js\?v=\$\{encodeURIComponent\(APP_VERSION\)\}`;/);
  assert.match(adminPageCode, /serviceWorker=\{adminServiceWorker\}/);
  assert.match(adminPageCode, /\{import\.meta\.env\.DEV \? \(/);
  assert.match(adminPageCode, /if \('serviceWorker' in navigator\) \{/);
  assert.match(adminPageCode, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(adminPageCode, /registration\.scope\.includes\('\/admin\/'\)/);
  assert.match(adminPageCode, /registration\.unregister\(\)/);
  assert.match(adminPageCode, /sessionStorage\.getItem\('__admin_sw_dev_reload__'\)/);
  assert.match(adminPageCode, /window\.location\.reload\(\)/);
  assert.match(adminLoginCode, /\{import\.meta\.env\.DEV \? \(/);
  assert.match(adminLoginCode, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(adminLoginCode, /registration\.scope\.includes\('\/admin\/'\)/);
  assert.match(adminLoginCode, /registration\.unregister\(\)/);
  assert.match(adminLoginCode, /if \(!ios12 && swScope && 'serviceWorker' in navigator\) \{/);
});

test('admin 首屏 orders 走本地稳定代理而不是 SSR 直连后端 orders', async () => {
  const adminPageCode = await readText(adminPagePath);

  assert.match(adminPageCode, /fetchJSON\(`\/api\/admin\/orders\?_=\$\{Date\.now\(\)\}`/);
  assert.doesNotMatch(adminPageCode, /fetchJSON\(`\$\{API_BASE_URL\}\/api\/admin\/orders\?_=\$\{Date\.now\(\)\}`/);
});
