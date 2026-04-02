import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');

test('master index source reads shops and settings from canonical and legacy init envelopes', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const isOkEnvelope = data && typeof data === 'object' && 'ok' in data && data\.ok === true;/);
  assert.match(page, /const isLegacyEnvelope = data && typeof data === 'object' && 'success' in data && data\.success === true;/);
  assert.match(page, /const initData = isOkEnvelope && 'data' in data && data\.data && typeof data\.data === 'object'[\s\S]*: isLegacyEnvelope && data && typeof data === 'object'[\s\S]*\? data[\s\S]*: null;/);
  assert.match(page, /const dataShops = initData && \(initData\.shops \|\| initData\.rows \|\| initData\.items\);/);
  assert.match(page, /const dataSettings = initData && initData\.settings;/);
  assert.match(page, /const isRetryLegacyEnvelope = retryInitData && typeof retryInitData === 'object' && 'success' in retryInitData && retryInitData\.success === true;/);

  assert.doesNotMatch(page, /const dataShops = data && data\.shops;/);
  assert.doesNotMatch(page, /const dataSettings = data && data\.settings;/);
});
