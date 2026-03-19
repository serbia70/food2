import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cssPath = resolve(process.cwd(), 'src/styles/global.css');

function findMatchingDivEnd(source: string, startIndex: number) {
  const slice = source.slice(startIndex);
  const tokenRegex = /<div\b|<\/div>/g;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(slice))) {
    if (match[0] === '<div') depth += 1;
    else depth -= 1;
    if (depth === 0) {
      return startIndex + match.index + match[0].length;
    }
  }
  return -1;
}

test('cart modal step 1 keeps summary inside the scrollable body', async () => {
  const css = await readFile(cssPath, 'utf8');
  const tsx = await readFile(resolve(process.cwd(), 'src/components/CartModal.tsx'), 'utf8');

  assert.match(css, /\.cart-modal,\s*\.user-modal\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/);
  assert.match(css, /\.cart-scroll-body\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?\}/);
  assert.match(css, /\.cart-modal\s+\.modal-content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?\}/);

  const step1Start = tsx.indexOf('/* ===== Step 1: 购物车清单 - 图4 ===== */');
  const step2Start = tsx.indexOf('/* ===== Step 2: 外卖表单 - 图1/图6 ===== */', step1Start);
  const step1 = tsx.slice(step1Start, step2Start);
  const scrollBodyStart = step1.indexOf('<div className="cart-scroll-body">');
  const scrollBodyEnd = findMatchingDivEnd(step1, scrollBodyStart);
  const summaryIndex = step1.indexOf('<div className="cart-summary">');

  assert.ok(scrollBodyStart > -1);
  assert.ok(scrollBodyEnd > scrollBodyStart);
  assert.ok(summaryIndex > scrollBodyStart);
  assert.ok(summaryIndex < scrollBodyEnd);
});
