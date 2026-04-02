import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecentUserOrderSummary, buildShopMembershipSummaries, buildUserOrderView, filterUserVisibleOrders } from './user-order-view.ts';

test('优先使用订单中的店铺名与 slug，并生成会员标签', () => {
  const view = buildUserOrderView({
    orderNo: 'A1001',
    totalAmount: 1680,
    createdAt: '2026-03-09 14:00:00',
    shopName: 'Burger House',
    slug: 'burger-house',
    points: 120,
    isVip: true,
  });

  assert.equal(view.shopName, 'Burger House');
  assert.equal(view.shopSlug, 'burger-house');
  assert.equal(view.isVip, true);
  assert.equal(view.points, 120);
  assert.equal(view.membershipLabel, 'VIP · 积分 120');
});

test('缺少店铺字段时回退为未知店铺', () => {
  const view = buildUserOrderView({
    orderNo: 'A1002',
    totalAmount: 50,
    createdAt: '2026-03-09 14:05:00',
  });

  assert.equal(view.shopName, '未知店铺');
  assert.equal(view.shopSlug, '');
  assert.equal(view.membershipLabel, '');
});

test('同店多笔订单应聚合为一个店铺权益摘要', () => {
  const summaries = buildShopMembershipSummaries([
    {
      orderNo: 'A1001',
      orderType: 'delivery',
      totalAmount: 1680,
      createdAt: '2026-03-09 14:00:00',
      shopName: 'Burger House',
      slug: 'burger-house',
      points: 120,
      isVip: true,
    },
    {
      orderNo: 'A1002',
      orderType: 'delivery',
      totalAmount: 980,
      createdAt: '2026-03-09 15:00:00',
      shopName: 'Burger House',
      slug: 'burger-house',
      points: 140,
      isVip: true,
    },
    {
      orderNo: 'B2001',
      orderType: 'delivery',
      totalAmount: 430,
      createdAt: '2026-03-09 13:00:00',
      restaurantName: 'Pizza Corner',
      shopSlug: 'pizza-corner',
      userPoints: 30,
      vipLevel: 'gold',
    },
  ]);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.shopName, 'Burger House');
  assert.equal(summaries[0]?.shopSlug, 'burger-house');
  assert.equal(summaries[0]?.points, 140);
  assert.equal(summaries[0]?.isVip, true);
  assert.equal(summaries[0]?.orderCount, 2);
  assert.equal(summaries[1]?.shopName, 'Pizza Corner');
  assert.equal(summaries[1]?.shopSlug, 'pizza-corner');
  assert.equal(summaries[1]?.points, 30);
  assert.equal(summaries[1]?.isVip, true);
});

test('仅有 shopId 时可通过店铺字典补出店铺名与 slug', () => {
  const view = buildUserOrderView(
    {
      orderNo: 'C3001',
      shopId: 2,
      totalAmount: 556,
      createdAt: '2026-03-02 02:41:00',
    },
    {
      2: { id: 2, name: '辣府海鲜', slug: 'la-fu-seafood' },
    },
  );

  assert.equal(view.shopName, '辣府海鲜');
  assert.equal(view.shopSlug, 'la-fu-seafood');
});

test('用户侧订单列表只保留外卖订单', () => {
  const visible = filterUserVisibleOrders([
    { id: 1, orderType: 'dine_in', orderNo: 'A1' },
    { id: 2, orderType: 'delivery', orderNo: 'A2' },
    { id: 3, orderType: 'delivery', orderNo: 'A3' },
  ]);

  assert.deepEqual(
    visible.map((order) => order.orderNo),
    ['A2', 'A3'],
  );
});

test('用户中心可生成最近外卖订单摘要', () => {
  const summary = buildRecentUserOrderSummary([
    { orderNo: 'A1', orderType: 'dine_in', createdAt: '2026-03-09 10:00:00', totalAmount: 20 },
    { orderNo: 'A2', orderType: 'delivery', createdAt: '2026-03-09 11:00:00', totalAmount: 50, status: 'pending' },
    { orderNo: 'A3', orderType: 'delivery', createdAt: '2026-03-09 12:00:00', totalAmount: 70, status: 'completed' },
  ]);

  assert.equal(summary.totalCount, 2);
  assert.equal(summary.latestOrder?.orderNo, 'A3');
});

test('user order view source uses canonical order fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/lib/user-order-view.ts'), 'utf8');

  assert.match(source, /order\?\.orderType/);
  assert.match(source, /createdAt/);
  assert.match(source, /order\?\.shopId/);
  assert.match(source, /shopName/);
  assert.match(source, /shopSlug/);
  assert.match(source, /isVip/);
  assert.match(source, /vipLevel/);
  assert.match(source, /userPoints/);
  assert.doesNotMatch(source, /order_type/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /shop_id/);
  assert.doesNotMatch(source, /shop_name/);
  assert.doesNotMatch(source, /shop_slug/);
  assert.doesNotMatch(source, /is_vip/);
  assert.doesNotMatch(source, /vip_level/);
  assert.doesNotMatch(source, /user_points/);
});
