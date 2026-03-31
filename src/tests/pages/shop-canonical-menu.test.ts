import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');

test('shop page source reads canonical shop and menu envelopes and normalizes both upload path variants', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const isOkShopEnvelope = shop && typeof shop === 'object' && 'ok' in shop && shop\.ok === true;/);
  assert.match(page, /const shopData = isOkShopEnvelope && 'data' in shop && shop\.data && typeof shop\.data === 'object' \? shop\.data : null;/);
  assert.match(page, /const parsedMenuData = parsed && typeof parsed === 'object' && 'ok' in parsed && parsed\.ok === true && 'data' in parsed \? parsed\.data : parsed;/);
  assert.match(page, /rawMenu = Array\.isArray\(parsedMenuData\) \? parsedMenuData : \[];/);
  assert.match(page, /if \(img\.startsWith\('\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /if \(img\.startsWith\('\/assets\/uploads\/'\)\) return `\$\{API_BASE_URL\}\$\{img\}`;/);
  assert.match(page, /img: normalizeMenuImageUrl\(p\?\.img \|\| p\?\.imageUrl\) \|\| '\/favicon\.svg',/);

  assert.doesNotMatch(page, /rawMenu = Array\.isArray\(parsed\) \? parsed : \[];/);
});
