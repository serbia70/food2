import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecentUserOrderSummary, buildShopMembershipSummaries, buildUserOrderView, filterUserVisibleOrders } from './user-order-view.ts';

test('优先使用订单中的店铺名与 slug，并生成会员标签', () => {
  const view = buildUserOrderView({
    order_no: 'A1001',
    total_amount: 1680,
    created_at: '2026-03-09 14:00:00',
    shop_name: 'Burger House',
    slug: 'burger-house',
    points: 120,
    is_vip: true,
  });

  assert.equal(view.shopName, 'Burger House');
  assert.equal(view.shopSlug, 'burger-house');
  assert.equal(view.isVip, true);
  assert.equal(view.points, 120);
  assert.equal(view.membershipLabel, 'VIP · 积分 120');
});

test('缺少店铺字段时回退为未知店铺', () => {
  const view = buildUserOrderView({
    order_no: 'A1002',
    total_amount: 50,
    created_at: '2026-03-09 14:05:00',
  });

  assert.equal(view.shopName, '未知店铺');
  assert.equal(view.shopSlug, '');
  assert.equal(view.membershipLabel, '');
});

test('同店多笔订单应聚合为一个店铺权益摘要', () => {
  const summaries = buildShopMembershipSummaries([
    {
      order_no: 'A1001',
      order_type: 'delivery',
      total_amount: 1680,
      created_at: '2026-03-09 14:00:00',
      shop_name: 'Burger House',
      slug: 'burger-house',
      points: 120,
      is_vip: true,
    },
    {
      order_no: 'A1002',
      order_type: 'delivery',
      total_amount: 980,
      created_at: '2026-03-09 15:00:00',
      shop_name: 'Burger House',
      slug: 'burger-house',
      points: 140,
      is_vip: true,
    },
    {
      order_no: 'B2001',
      order_type: 'delivery',
      total_amount: 430,
      created_at: '2026-03-09 13:00:00',
      restaurant_name: 'Pizza Corner',
      shop_slug: 'pizza-corner',
      user_points: 30,
      vip_level: 'gold',
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

test('仅有 shop_id 时可通过店铺字典补出店铺名与 slug', () => {
  const view = buildUserOrderView(
    {
      order_no: 'C3001',
      shop_id: 2,
      total_amount: 556,
      created_at: '2026-03-02 02:41:00',
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
    { id: 1, order_type: 'dine_in', order_no: 'A1' },
    { id: 2, order_type: 'delivery', order_no: 'A2' },
    { id: 3, order_type: 'delivery', order_no: 'A3' },
  ]);

  assert.deepEqual(
    visible.map((order) => order.order_no),
    ['A2', 'A3'],
  );
});

test('用户中心可生成最近外卖订单摘要', () => {
  const summary = buildRecentUserOrderSummary([
    { order_no: 'A1', order_type: 'dine_in', created_at: '2026-03-09 10:00:00', total_amount: 20 },
    { order_no: 'A2', order_type: 'delivery', created_at: '2026-03-09 11:00:00', total_amount: 50, status: 'pending' },
    { order_no: 'A3', order_type: 'delivery', created_at: '2026-03-09 12:00:00', total_amount: 70, status: 'completed' },
  ]);

  assert.equal(summary.totalCount, 2);
  assert.equal(summary.latestOrder?.order_no, 'A3');
});
