import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/UserCenterPageIsland.tsx');

test('UserCenterPageIsland source uses canonical shop context fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /setCurrentShopId\(String\(\(sourceOrder as any\)\?\.shopId \|\| \(sourceOrder as any\)\?\.restaurantId \|\| ''\)\);/);

  assert.doesNotMatch(source, /sourceOrder as any\)\?\.shop_id/);
  assert.doesNotMatch(source, /sourceOrder as any\)\?\.restaurant_id/);
});
