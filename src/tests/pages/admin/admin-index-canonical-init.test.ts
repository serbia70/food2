import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');

test('admin index source reads canonical-unwrapped shop payload from fetchJSON', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const rawShop = asObject\(shopResp\.data\);/);
  assert.doesNotMatch(page, /shopResp\.data && typeof shopResp\.data === 'object' && 'data' in shopResp\.data/);
});
