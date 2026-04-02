import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/admin/orders.ts');

test('api admin orders route source uses canonical item fields', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /if \(item\.productId == null\) item\.productId = Number\.isNaN\(pid\) \? item\.id \|\| 0 : pid;/);
  assert.match(source, /if \(item\.quantity == null\) item\.quantity = 1;/);

  assert.doesNotMatch(source, /item\.product_id/);
  assert.doesNotMatch(source, /item\.qty/);
});
