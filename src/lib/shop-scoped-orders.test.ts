import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurrentShopEmptyStateMessage, buildCurrentShopMembershipSummary, filterOrdersForCurrentShop, splitOrdersByCurrentShop } from './shop-scoped-orders.ts';

test('当前店铺订单过滤只保留当前店铺外卖单', () => {
  const result = filterOrdersForCurrentShop(
    [
      { order_no: 'A1', order_type: 'delivery', shop_id: 1 },
      { order_no: 'A2', order_type: 'delivery', shop_id: 2 },
      { order_no: 'A3', order_type: 'dine_in', shop_id: 2 },
    ],
    { id: '2', slug: '02' },
  );

  assert.deepEqual(result.map((item) => item.order_no), ['A2']);
});

test('当前店铺订单过滤兼容 slug 匹配', () => {
  const result = filterOrdersForCurrentShop(
    [
      { order_no: 'B1', order_type: 'delivery', slug: '02' },
      { order_no: 'B2', order_type: 'delivery', shop_slug: '01' },
    ],
    { slug: '02' },
  );

  assert.deepEqual(result.map((item) => item.order_no), ['B1']);
});

test('可从当前店铺订单中生成积分与 VIP 摘要', () => {
  const summary = buildCurrentShopMembershipSummary([
    { order_no: 'C1', order_type: 'delivery', shop_id: 2, points: 20, is_vip: false },
    { order_no: 'C2', order_type: 'delivery', shop_id: 2, user_points: 80, vip_level: 'gold' },
  ]);

  assert.equal(summary.points, 80);
  assert.equal(summary.isVip, true);
  assert.equal(summary.label, 'VIP · 积分 80');
});

test('可将订单拆分为当前店铺与其他店铺', () => {
  const result = splitOrdersByCurrentShop(
    [
      { order_no: 'D1', order_type: 'delivery', shop_id: 2 },
      { order_no: 'D2', order_type: 'delivery', shop_id: 1 },
      { order_no: 'D3', order_type: 'dine_in', shop_id: 2 },
    ],
    { id: '2', slug: '02' },
  );

  assert.deepEqual(result.currentShopOrders.map((item) => item.order_no), ['D1']);
  assert.deepEqual(result.otherOrders.map((item) => item.order_no), ['D2']);
});

test('当前店铺空态文案应带店铺名', () => {
  assert.equal(
    buildCurrentShopEmptyStateMessage('02号店'),
    '当前店铺 02号店 暂无外卖订单，可继续在本店下单',
  );
});
