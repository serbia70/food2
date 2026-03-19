import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('remarks modal keeps the footer reachable with a dedicated scroll body', async () => {
  const filePath = resolve(process.cwd(), 'src/components/admin/AdminModals.astro');
  const astro = await readFile(filePath, 'utf8');
  const start = astro.indexOf('<!-- 备注弹窗 (Remarks Modal) -->');
  const end = astro.indexOf('<!-- 详情/修改弹窗 (Details Modal) -->', start);
  const block = astro.slice(start, end);

  assert.ok(block.includes('overflow:hidden;'));
  assert.ok(block.includes('min-height:0; overflow-y:auto;'));
  assert.ok(block.includes('class="remark-ui"'));
});
