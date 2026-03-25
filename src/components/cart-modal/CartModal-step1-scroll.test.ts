import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('step 1 cart summary stays inside the scrollable modal body', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/components/CartModal.tsx'), 'utf8');
  const step1Start = source.indexOf('/* ===== Step 1: 购物车清单 - 图4 ===== */');
  const step2Start = source.indexOf('/* ===== Step 2: 外卖表单 - 图1/图6 ===== */', step1Start);
  const step1 = source.slice(step1Start, step2Start);
  const summaryIndex = step1.indexOf('<div className="cart-summary">');
  const beforeSummary = step1.slice(0, summaryIndex);

  const openDivs = (beforeSummary.match(/<div\b/g) || []).length;
  const closeDivs = (beforeSummary.match(/<\/div>/g) || []).length;

  assert.ok(summaryIndex > -1);
  assert.ok(openDivs > closeDivs);
});

test('delivery button state contract is locked in CartModeActions', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/components/cart-modal/CartModeActions.tsx'), 'utf8');

  assert.match(source, /const deliveryDisabled = totalCount === 0 \|\| !isShopOpen \|\| isDeliveryLocked \|\| !enableDelivery;/);
  assert.match(source, /const deliveryLabel = !enableDelivery[\s\S]*"Dostava nije dostupna \/ 外卖尚未开通"[\s\S]*"🔒 外卖暂停"[\s\S]*"Dostava \/ 外卖"/);
  assert.match(source, /\{!tableNumber && \(/);
  assert.doesNotMatch(source, /\{enableDelivery && !tableNumber && \(/);
  assert.match(source, /disabled=\{deliveryDisabled\}/);
  assert.match(source, /onClick=\{\(\) => \{[\s\S]*if \(deliveryDisabled\) return;[\s\S]*onStartDelivery\(\);[\s\S]*\}\}/);
});

test('delivery button state contract is locked in shop page', async () => {
  const pageSource = await readFile(resolve(process.cwd(), 'src/pages/[slug]/index.astro'), 'utf8');

  assert.match(pageSource, /enableDelivery=\{enableDelivery\}/);
});
