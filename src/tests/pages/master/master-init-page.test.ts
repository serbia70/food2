import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');

test('master index source reads shops and settings from canonical init envelope', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const isOkEnvelope = data && typeof data === 'object' && 'ok' in data && data\.ok === true;/);
  assert.match(page, /const initData = isOkEnvelope && 'data' in data && data\.data && typeof data\.data === 'object' \? data\.data : null;/);
  assert.match(page, /const dataShops = initData && initData\.shops;/);
  assert.match(page, /const dataSettings = initData && initData\.settings;/);

  assert.doesNotMatch(page, /const dataShops = data && data\.shops;/);
  assert.doesNotMatch(page, /const dataSettings = data && data\.settings;/);
});
