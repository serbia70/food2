import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/admin/localize-images-batch.ts');

test('api admin localize-images-batch source uses canonical product fields', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /categoryId: Number\(p\?\.categoryId \|\| 0\) \|\| 0,/);
  assert.match(source, /subName: String\(p\?\.subName \|\| ''\),/);
  assert.match(source, /categoryId: Number\(product\?\.categoryId \|\| 0\) \|\| 0,/);
  assert.match(source, /subName: String\(product\?\.subName \|\| ''\),/);

  assert.doesNotMatch(source, /category_id/);
  assert.doesNotMatch(source, /sub_name/);
});
