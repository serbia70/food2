import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurrentShopEmptyStateMessage, buildCurrentShopMembershipSummary, filterOrdersForCurrentShop, splitOrdersByCurrentShop } from './shop-scoped-orders.ts';

test('当前店铺订单过滤只保留当前店铺外卖单', () => {
  const result = filterOrdersForCurrentShop(
    [
      { orderNo: 'A1', orderType: 'delivery', shopId: 1 },
      { orderNo: 'A2', orderType: 'delivery', shopId: 2 },
      { orderNo: 'A3', orderType: 'dine_in', shopId: 2 },
    ],
    { id: '2', slug: '02' },
  );

  assert.deepEqual(result.map((item) => item.orderNo), ['A2']);
});

test('当前店铺订单过滤兼容 slug 匹配', () => {
  const result = filterOrdersForCurrentShop(
    [
      { orderNo: 'B1', orderType: 'delivery', slug: '02' },
      { orderNo: 'B2', orderType: 'delivery', shopSlug: '01' },
    ],
    { slug: '02' },
  );

  assert.deepEqual(result.map((item) => item.orderNo), ['B1']);
});

test('可从当前店铺订单中生成积分与 VIP 摘要', () => {
  const summary = buildCurrentShopMembershipSummary([
    { orderNo: 'C1', orderType: 'delivery', shopId: 2, points: 20, isVip: false },
    { orderNo: 'C2', orderType: 'delivery', shopId: 2, userPoints: 80, vipLevel: 'gold' },
  ]);

  assert.equal(summary.points, 80);
  assert.equal(summary.isVip, true);
  assert.equal(summary.label, 'VIP · 积分 80');
});

test('可将订单拆分为当前店铺与其他店铺', () => {
  const result = splitOrdersByCurrentShop(
    [
      { orderNo: 'D1', orderType: 'delivery', shopId: 2 },
      { orderNo: 'D2', orderType: 'delivery', shopId: 1 },
      { orderNo: 'D3', orderType: 'dine_in', shopId: 2 },
    ],
    { id: '2', slug: '02' },
  );

  assert.deepEqual(result.currentShopOrders.map((item) => item.orderNo), ['D1']);
  assert.deepEqual(result.otherOrders.map((item) => item.orderNo), ['D2']);
});

test('shop scoped orders source uses canonical order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/lib/shop-scoped-orders.ts'), 'utf8');

  assert.match(source, /order\?\.orderType/);
  assert.match(source, /order\?\.shopId/);
  assert.match(source, /order\?\.shopSlug/);
  assert.match(source, /order\?\.isVip/);
  assert.match(source, /vipLevel/);
  assert.match(source, /userPoints/);
  assert.match(source, /order\?\.orderNo/);
  assert.doesNotMatch(source, /order_type/);
  assert.doesNotMatch(source, /shop_id/);
  assert.doesNotMatch(source, /shop_slug/);
  assert.doesNotMatch(source, /is_vip/);
  assert.doesNotMatch(source, /vip_level/);
  assert.doesNotMatch(source, /user_points/);
  assert.doesNotMatch(source, /order_no/);
});

test('当前店铺空态文案应带店铺名', () => {
  assert.equal(
    buildCurrentShopEmptyStateMessage('02号店'),
    '当前店铺 02号店 暂无外卖订单，可继续在本店下单',
  );
});
