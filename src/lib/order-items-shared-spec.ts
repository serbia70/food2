import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOrderItemsShared } from './order-items-shared.ts';

test('parseOrderItemsShared reads array-shaped items json string', () => {
  const items = parseOrderItemsShared(JSON.stringify([
    { name: '可乐', quantity: 1, productId: 9 },
  ]));

  assert.deepEqual(items, [
    { name: '可乐', quantity: 1, productId: 9 },
  ]);
});

test('parseOrderItemsShared falls back to object-shaped items json string', () => {
  const items = parseOrderItemsShared(JSON.stringify({
    '11': { name: '鱼香肉丝', quantity: 2 },
    '12': { name: '米饭' },
  }));

  assert.deepEqual(items, [
    { name: '鱼香肉丝', quantity: 2 },
    { name: '米饭' },
  ]);
});

test('parseOrderItemsShared accepts object values directly', () => {
  const items = parseOrderItemsShared({
    '21': { name: '宫保鸡丁', quantity: 1 },
    '22': { name: '米饭', quantity: 2 },
  });

  assert.deepEqual(items, [
    { name: '宫保鸡丁', quantity: 1 },
    { name: '米饭', quantity: 2 },
  ]);
});

test('parseOrderItemsShared returns empty array for invalid json', () => {
  assert.deepEqual(parseOrderItemsShared('{bad json'), []);
});

test('buildOrderItemTextLinesShared formats object-shaped items json for user-facing lists', async () => {
  const { buildOrderItemTextLinesShared } = await import('./order-items-shared.ts');

  const lines = buildOrderItemTextLinesShared(JSON.stringify({
    '11': { name: '鱼香肉丝', subName: 'Yu Xiang', quantity: 2 },
    '12': { name: '米饭' },
  }));

  assert.deepEqual(lines, [
    '• 鱼香肉丝 (Yu Xiang) x2',
    '• 米饭 x1',
  ]);
});

test('buildOrderItemSummaryShared formats object-shaped items json for compact table details', async () => {
  const { buildOrderItemSummaryShared } = await import('./order-items-shared.ts');

  const summary = buildOrderItemSummaryShared(JSON.stringify({
    '11': { name: '鱼香肉丝', subName: 'Yu Xiang', quantity: 2 },
    '12': { productName: '米饭', qty: 3 },
  }));

  assert.equal(summary, '鱼香肉丝(Yu Xiang)x2、米饭x3');
});

test('buildAdminTableOrderSummaryShared formats object-shaped items json for admin table summaries', async () => {
  const { buildAdminTableOrderSummaryShared } = await import('./order-items-shared.ts');

  const summary = buildAdminTableOrderSummaryShared(JSON.stringify({
    '11': { name: '鱼香肉丝', quantity: 2 },
    '12': { productName: '米饭', qty: 1 },
  }));

  assert.equal(summary, '鱼香肉丝 x2, 米饭 x1');
});
