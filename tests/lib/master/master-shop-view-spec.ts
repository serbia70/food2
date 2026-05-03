import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMasterShopView } from '../../../src/lib/master-shop-view.ts';

test('buildMasterShopView 输出状态、计费、堂食、tier 和 copy path', () => {
  const view = buildMasterShopView({
    id: 7,
    name: 'Shop A',
    slug: 'shop-a',
    status: 'active',
    billing_status: 'warning',
    billing_plan_type: 'business',
    commission_type: 'percentage',
    commission_value: 6,
    delivery_enabled: 1,
    enable_dine_in: 1,
    reservation_enabled: 1,
    today_order_count: 12,
    today_revenue: 3400,
    delivery_today_count: 8,
    delivery_today_revenue: 2500,
    dine_in_today_count: 4,
    dine_in_today_revenue: 900,
    billing_balance_rsd: 100,
    commission_month_rsd: 700,
    commission_total_rsd: 3200,
    expire_date: '2026-05-03',
    shop_tier_mode: 'override',
    shop_tier_override: 'business',
    dine_in_billing_start_at: '2026-04-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-04-26');

  assert.equal(view.id, 7);
  assert.equal(view.name, 'Shop A');
  assert.equal(view.slug, 'shop-a');
  assert.equal(view.billingPlanType, 'business');
  assert.equal(view.commissionValue, 6);
  assert.equal(view.enableDelivery, true);
  assert.equal(view.enableDineIn, true);
  assert.equal(view.enableReservation, true);
  assert.equal(view.todayOrders, 12);
  assert.equal(view.todayRevenue, 3400);
  assert.equal(view.balanceRsd, 100);
  assert.equal(view.shopTier.effectiveTier, 'business');
  assert.equal(view.copyStorefrontPath, '/shop-a');
  assert.equal(view.copyAdminPath, '/admin/shop-a');
  assert.equal(view.dineInBillingStartAt, '2026-04-01');
  assert.equal(view.dineInExpiresAt, '2026-04-30');
});

test('buildMasterShopView 支持 display_* fallback 与未命名店铺 fallback', () => {
  const view = buildMasterShopView({
    id: 8,
    slug: 'shop-b',
    status: 'disabled',
    display_status: '自定义状态',
    display_shop_state: '自定义店铺状态',
    display_shop_state_reason: '原因',
    display_billing_status: '自定义计费状态',
    display_expiry_status: '自定义到期状态',
    billing_status: '',
    billing_balance_rsd: 0,
    enable_dine_in: 0,
  }, '2026-04-26');

  assert.equal(view.name, '未命名店铺');
  assert.equal(view.statusLabel, '自定义状态');
  assert.equal(view.shopStateLabel, '自定义店铺状态');
  assert.equal(view.shopStateReason, '原因');
  assert.equal(view.billingLabel, '自定义计费状态');
  assert.equal(view.expiryLabel, '自定义到期状态');
});
