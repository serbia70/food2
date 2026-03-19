import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterShopView } from './master-shop-view.ts';

test('将店铺账单与到期状态映射为表格视图字段', () => {
  const view = buildMasterShopView({
    id: 7,
    name: 'Shop 02',
    slug: '02',
    status: 'active',
    expire_date: '2099-12-31',
    billing_status: 'past_due',
    billing_balance_rsd: 1800,
    today_order_count: 12,
    today_revenue: 98765,
    commission_month_rsd: 3200,
    commission_total_rsd: 16800,
  });

  assert.equal(view.name, 'Shop 02');
  assert.equal(view.slug, '02');
  assert.equal(view.statusLabel, '营业中');
  assert.equal(view.billingLabel, '逾期');
  assert.equal(view.rowTone, 'billing-overdue');
  assert.equal(view.todayOrders, 12);
  assert.equal(view.todayRevenue, 98765);
  assert.equal(view.balanceRsd, 1800);
});

test('即将到期店铺应映射为 expiring 行样式', () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);

  const view = buildMasterShopView({
    name: 'Soon Expire',
    slug: 'soon-expire',
    status: 'active',
    expire_date: soon.toISOString(),
    billing_status: 'active',
  });

  assert.equal(view.expiryLabel, '即将到期');
  assert.equal(view.rowTone, 'expiring');
});

test('缺失数字字段时回退为 0 且 slug 仍可复制使用', () => {
  const view = buildMasterShopView({
    name: 'Minimal Shop',
    slug: 'minimal-shop',
  });

  assert.equal(view.todayOrders, 0);
  assert.equal(view.todayRevenue, 0);
  assert.equal(view.monthCommissionRsd, 0);
  assert.equal(view.copyStorefrontPath, '/minimal-shop');
  assert.equal(view.copyAdminPath, '/admin/minimal-shop');
});

test('导出筛选与排序所需的严重级别和排序值', () => {
  const view = buildMasterShopView({
    id: 9,
    name: 'Locked Shop',
    slug: 'locked-shop',
    status: 'disabled',
    billing_plan_type: 'business',
    billing_status: 'warning',
    delivery_locked: true,
    today_revenue: 15000,
    today_order_count: 9,
    billing_balance_rsd: 600,
  });

  assert.equal(view.billingSeverity, 2);
  assert.equal(view.expirySeverity, 0);
  assert.equal(view.isDeliveryLocked, true);
  assert.equal(view.id, 9);
  assert.equal(view.rawStatus, 'disabled');
  assert.equal(view.billingPlanType, 'business');
  assert.equal(view.sortValueRevenue, 15000);
  assert.equal(view.sortValueOrders, 9);
  assert.equal(view.sortValueBalance, 600);
});

test('legacy inactive 账单状态应映射为预警而不是直接显示英文', () => {
  const view = buildMasterShopView({
    name: 'Legacy Shop',
    slug: 'legacy-shop',
    status: 'active',
    billing_status: 'inactive',
    billing_balance_rsd: 9800,
  });

  assert.equal(view.statusLabel, '营业中');
  assert.equal(view.billingLabel, '预警');
  assert.equal(view.billingSeverity, 2);
});

test('优先使用后端返回的 display 字段', () => {
  const view = buildMasterShopView({
    name: 'Display Shop',
    slug: 'display-shop',
    status: 'active',
    billing_status: 'inactive',
    display_shop_state: '正常运营',
    display_status: '营业中',
    display_billing_status: '正常',
    display_expiry_status: '未设置',
  });

  assert.equal(view.shopStateLabel, '正常运营');
  assert.equal(view.statusLabel, '营业中');
  assert.equal(view.billingLabel, '正常');
  assert.equal(view.expiryLabel, '未设置');
});

test('显示统一经营限制型门店状态', () => {
  const view = buildMasterShopView({
    name: 'Dining Locked Shop',
    slug: 'dining-locked',
    display_shop_state: '堂食点餐停止',
    display_shop_state_reason: '余额不足，堂食点餐已停止',
    display_billing_status: '预警',
  });

  assert.equal(view.shopStateLabel, '堂食点餐停止');
  assert.equal(view.shopStateReason, '余额不足，堂食点餐已停止');
  assert.equal(view.billingLabel, '预警');
});

test('保留真实提成方案字段供编辑弹窗回填', () => {
  const view = buildMasterShopView({
    id: 12,
    name: 'Commission Shop',
    slug: 'commission-shop',
    status: 'active',
    billing_plan_type: 'business',
    commission_type: 'per_order',
    commission_value: 18,
  });

  assert.equal(view.billingPlanType, 'business');
  assert.equal(view.commissionType, 'per_order');
  assert.equal(view.commissionValue, 18);
});

test('保留真实营业开关字段供编辑弹窗回填', () => {
  const view = buildMasterShopView({
    id: 13,
    name: 'Toggle Shop',
    slug: 'toggle-shop',
    enable_delivery: 0,
    enable_dine_in: 1,
    enable_reservation: 0,
  });

  assert.equal(view.enableDelivery, false);
  assert.equal(view.enableDineIn, true);
  assert.equal(view.enableReservation, false);
});

test('堂食账单字段应透传到主控店铺视图并保留钱包字段', () => {
  const view = buildMasterShopView(
    {
      id: 21,
      name: 'DineIn Shop',
      slug: 'dinein-shop',
      status: 'active',
      billing_status: 'active',
      billing_balance_rsd: 4200,
      expire_date: '2099-12-31',
      dine_in_billing_start_at: '2027-02-01',
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
      dine_in_disabled_at: '2027-03-07',
      dine_in_stop_reason: 'manual',
      enable_dine_in: 1,
    },
    '2027-02-20',
  );

  assert.equal(view.billingLabel, '正常');
  assert.equal(view.billingSeverity, 1);
  assert.equal(view.balanceRsd, 4200);
  assert.equal(view.rowTone, 'normal');

  assert.equal(view.dineInBillingStartAt, '2027-02-01');
  assert.equal(view.dineInExpiresAt, '2027-03-01');
  assert.equal(view.dineInGraceUntil, '2027-03-06');
  assert.equal(view.dineInDisabledAt, '2027-03-07');
  assert.equal(view.dineInStopReason, 'manual');
  assert.equal(view.dineInAlertLevel, 'normal');
  assert.equal(view.dineInStatusLabel, '正常');
  assert.equal(view.dineInRowTone, 'normal');
});

test('堂食预警门店应映射 warning 行风险色', () => {
  const view = buildMasterShopView(
    {
      name: 'DineIn Warning',
      slug: 'dinein-warning',
      billing_status: 'active',
      enable_dine_in: 1,
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-02-24',
  );

  assert.equal(view.rowTone, 'billing-warning');
  assert.equal(view.dineInAlertLevel, 'warning');
  assert.equal(view.dineInStatusLabel, '即将到期');
  assert.equal(view.dineInRowTone, 'warning');
});

test('堂食逾期门店应映射 danger 行风险色', () => {
  const view = buildMasterShopView(
    {
      name: 'DineIn Overdue',
      slug: 'dinein-overdue',
      billing_status: 'active',
      enable_dine_in: 1,
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-03-03',
  );

  assert.equal(view.rowTone, 'billing-overdue');
  assert.equal(view.dineInAlertLevel, 'overdue');
  assert.equal(view.dineInStatusLabel, '已逾期');
  assert.equal(view.dineInRowTone, 'danger');
});

test('堂食字段缺失时仍兼容 legacy expire_date 回退', () => {
  const view = buildMasterShopView(
    {
      name: 'Legacy Expire Shop',
      slug: 'legacy-expire-shop',
      billing_status: 'active',
      enable_dine_in: 1,
      expire_date: '2027-03-01',
    },
    '2027-02-24',
  );

  assert.equal(view.dineInExpiresAt, '2027-03-01');
  assert.equal(view.dineInStatusLabel, '即将到期');
  assert.equal(view.dineInAlertLevel, 'warning');
  assert.equal(view.dineInRowTone, 'warning');
});
