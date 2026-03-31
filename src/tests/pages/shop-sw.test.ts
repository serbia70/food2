import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const swPath = new URL('../../../public/shop-sw.js', import.meta.url);
const shopPagePath = new URL('../../../src/pages/[slug]/index.astro', import.meta.url);

async function readText(url: URL) {
  return fs.readFile(url, 'utf8');
}

test('shop page keeps stable service worker registration so normal /101 interactions do not regress', async () => {
  const [swCode, shopPageCode] = await Promise.all([
    readText(swPath),
    readText(shopPagePath),
  ]);

  assert.match(swCode, /const CACHE_NAME = `\$\{CACHE_PREFIX\}1`;/);
  assert.doesNotMatch(swCode, /searchParams\.get\('v'\)/);
  assert.match(shopPageCode, /serviceWorker="\/shop-sw\.js"/);
  assert.doesNotMatch(shopPageCode, /APP_VERSION/);
});
