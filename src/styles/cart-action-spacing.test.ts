import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cssPath = resolve(process.cwd(), 'src/styles/global.css');

function extractStep1Block(source: string) {
  const start = source.indexOf('/* ===== Step 1: 购物车清单 - 图4 ===== */');
  const end = source.indexOf('/* ===== Step 2: 外卖表单 - 图1/图6 ===== */', start);
  return source.slice(start, end);
}

test('cart action buttons keep distance from the remark panel', async () => {
  const css = await readFile(cssPath, 'utf8');
  const tsx = await readFile(resolve(process.cwd(), 'src/components/CartModal.tsx'), 'utf8');
  const step1 = extractStep1Block(tsx);

  assert.match(css, /\.cart-action-btns\s*\{[\s\S]*?margin-top:\s*16px;[\s\S]*?\}/);
  assert.match(step1, /<CartDineInRemarksPanel[\s\S]*?<CartModeActions/);
  assert.ok(step1.indexOf('<CartDineInRemarksPanel') < step1.indexOf('<CartModeActions'));
});
