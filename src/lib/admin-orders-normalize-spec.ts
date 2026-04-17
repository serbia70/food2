import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAdminOrderItemsJSONString, normalizeRemarkJSONString, parseAdminOrderItems } from './admin-dashboard-utils.ts';
import { parseOrderItemsShared } from './order-items-shared.ts';

function normalizeAdminOrdersPayloadForTest(data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(data)) return [];
  return data.map((row: unknown) => {
    const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const tableInfo = String(source.tableInfo || '').trim();
    return {
      ...source,
      id: source.id,
      orderNo: source.orderNo ?? source.order_no ?? source.id,
      orderType: source.orderType ?? (tableInfo ? 'dine_in' : ''),
      status: source.status ?? (tableInfo ? 'pending' : ''),
      itemsJson: normalizeAdminOrderItemsJSONString(source.itemsJson),
      remarksJson: normalizeRemarkJSONString(source.remarksJson),
    };
  });
}


test('admin orders normalization prefers order_no over id when orderNo is missing', () => {
  const rows = normalizeAdminOrdersPayloadForTest([
    {
      id: 648,
      order_no: '260415010',
      status: 'awaiting_courier',
    },
  ]);

  assert.equal(rows[0]?.orderNo, '260415010');
});

test('admin orders normalization rewrites object-shaped itemsJson into array json string for SSR readers', () => {
  const rows = normalizeAdminOrdersPayloadForTest([
    {
      id: 101,
      itemsJson: JSON.stringify({
        '11': { name: '鱼香肉丝', quantity: 2 },
        '12': { name: '米饭' },
      }),
    },
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(String(rows[0]?.itemsJson || '[]')), [
    { name: '鱼香肉丝', quantity: 2, productId: 11 },
    { name: '米饭', quantity: 1, productId: 12 },
  ]);
});

test('admin orders normalization keeps array-shaped itemsJson unchanged', () => {
  const original = JSON.stringify([
    { name: '可乐', quantity: 1, productId: 9 },
  ]);
  const rows = normalizeAdminOrdersPayloadForTest([
    {
      id: 102,
      itemsJson: original,
    },
  ]);

  assert.equal(rows[0]?.itemsJson, original);
});

test('admin orders parsed items stay readable for script renderer after normalization', () => {
  const rows = normalizeAdminOrdersPayloadForTest([
    {
      id: 103,
      itemsJson: JSON.stringify({
        '11': { name: '鱼香肉丝', quantity: 2 },
        '12': { name: '米饭' },
      }),
    },
  ]);

  assert.deepEqual(parseAdminOrderItems(String(rows[0]?.itemsJson || '[]')), [
    { name: '鱼香肉丝', quantity: 2, productId: 11 },
    { name: '米饭', quantity: 1, productId: 12 },
  ]);
});

test('admin tables parser stays aligned with shared items parser after normalization', () => {
  const normalized = normalizeAdminOrderItemsJSONString(JSON.stringify({
    '21': { name: '宫保鸡丁', quantity: 1 },
    '22': { name: '米饭', quantity: 2 },
  }));

  assert.deepEqual(parseAdminOrderItems(normalized), [
    { name: '宫保鸡丁', quantity: 1, productId: 21 },
    { name: '米饭', quantity: 2, productId: 22 },
  ]);
  assert.deepEqual(parseAdminOrderItems(normalized), parseOrderItemsShared(normalized));
});

test('admin orders normalization rewrites direct object-shaped itemsJson into array json string too', () => {
  const normalized = normalizeAdminOrderItemsJSONString({
    '31': { name: '麻婆豆腐', quantity: 1 },
    '32': { name: '米饭' },
  });

  assert.deepEqual(JSON.parse(normalized), [
    { name: '麻婆豆腐', quantity: 1, productId: 31 },
    { name: '米饭', quantity: 1, productId: 32 },
  ]);
});
