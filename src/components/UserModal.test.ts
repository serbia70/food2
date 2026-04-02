import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/UserModal.tsx');

test('UserModal source uses canonical order item fields for re-add to cart', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /const items = typeof \(order as any\)\.itemsJson === 'string'/);
  assert.match(source, /\? JSON\.parse\(\(order as any\)\.itemsJson\)/);
  assert.match(source, /: \(order as any\)\.itemsJson;/);
  assert.match(source, /subName: i\.subName \|\| "",/);

  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /sub_name/);
});
