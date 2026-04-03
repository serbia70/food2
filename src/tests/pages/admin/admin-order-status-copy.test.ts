import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');

test('admin delivery cards label awaiting_courier as waiting rider confirmation', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /o\.status === 'awaiting_courier' \? '待骑手确认'/);
  assert.match(source, /o\.status === 'delivering' \? '骑手已接单'/);
});
