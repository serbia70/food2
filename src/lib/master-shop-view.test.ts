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

test('店铺视图应暴露预订和外卖的独立计划', () => {
  const view = buildMasterShopView(
    {
      id: 12,
      name: 'Commission Shop',
      slug: 'commission-shop',
      status: 'active',
      billing_plan_type: 'business',
      commission_type: 'per_order',
      commission_value: 18,
      reservation_enabled: 1,
      reservation_commission_type: 'percentage',
      reservation_commission_value: 0,
      delivery_enabled: 0,
      delivery_commission_type: 'per_order',
      delivery_commission_value: 8,
    },
    {
      defaults: {
        reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 0);
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.reservationPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.deliveryPlan.enabled, false);
  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.deliveryPlan.commissionValue, 8);
  assert.equal(view.deliveryPlan.displayText, '每单 8 RSD');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.billingPlanType, 'business');
  assert.equal(view.commissionType, 'per_order');
  assert.equal(view.commissionValue, 18);
});

test('保存回包仅返回 legacy commission_value 时仍能回填外卖计划', () => {
  const view = buildMasterShopView(
    {
      id: 13,
      name: 'Legacy Commission Shop',
      slug: 'legacy-commission-shop',
      status: 'active',
      commission_type: 'per_order',
      commission_value: 18,
      enable_reservation: 1,
      enable_delivery: 0,
    },
    {
      defaults: {
        reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 3);
  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.reservationPlan.source, 'default');
  assert.equal(view.reservationPlan.sourceLabel, '全局默认');
  assert.equal(view.deliveryPlan.enabled, false);
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'default');
  assert.equal(view.deliveryPlan.sourceLabel, '全局默认');
});

test('master init 回包中的 commission_mode override 应回填外卖覆盖值', () => {
  const view = buildMasterShopView(
    {
      id: 18,
      name: 'Saved Override Shop',
      slug: 'saved-override-shop',
      status: 'active',
      commission_mode: 'override',
      commission_type: 'percentage',
      commission_value: 6,
      commission_override_type: 'percentage',
      commission_override_value: 6,
    },
    {
      defaults: {
        reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(view.deliveryPlan.enabled, true);
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 6);
  assert.equal(view.deliveryPlan.displayText, '6%');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
});

test('编辑回包中的兼容费率字段也应视为店铺覆盖', () => {
  const view = buildMasterShopView(
    {
      id: 14,
      name: 'Edit Echo Shop',
      slug: 'edit-echo-shop',
      status: 'active',
      commission_type: 'per_order',
      commission_value: 30,
      subscriptionDeliveryCommissionType: 'percentage',
      subscriptionDeliveryCommissionValue: 0,
      businessDeliveryCommissionType: 'per_order',
      businessDeliveryCommissionValue: 8,
    },
    {
      defaults: {
        reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 0);
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.reservationPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.deliveryPlan.enabled, true);
  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.deliveryPlan.commissionValue, 8);
  assert.equal(view.deliveryPlan.displayText, '每单 8 RSD');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
});

test('分拆字段和兼容别名同时存在时应优先使用分拆字段', () => {
  const view = buildMasterShopView({
    id: 15,
    name: 'Snake Case Shop',
    slug: 'snake-case-shop',
    status: 'active',
    reservation_commission_type: 'per_order',
    reservation_commission_value: 30,
    subscriptionFeeRsd: 18,
    delivery_commission_type: 'percentage',
    delivery_commission_value: 5,
    businessFeeRsd: 30,
  });

  assert.equal(view.reservationPlan.commissionType, 'per_order');
  assert.equal(view.reservationPlan.commissionValue, 30);
  assert.equal(view.reservationPlan.displayText, '每单 30 RSD');
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.reservationPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
});

test('编辑回包中的 snake_case 兼容费率字段也应视为店铺覆盖', () => {
  const view = buildMasterShopView({
    id: 15,
    name: 'Snake Case Shop',
    slug: 'snake-case-shop',
    status: 'active',
    enable_reservation: 0,
    subscription_delivery_commission_type: 'per_order',
    subscription_delivery_commission_value: 30,
    enable_delivery: 0,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 30,
  });

  assert.equal(view.reservationPlan.enabled, false);
  assert.equal(view.reservationPlan.commissionType, 'per_order');
  assert.equal(view.reservationPlan.commissionValue, 30);
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.reservationPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.reservationPlan.displayText, '每单 30 RSD');
  assert.equal(view.deliveryPlan.enabled, false);
  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.deliveryPlan.commissionValue, 30);
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.deliveryPlan.displayText, '每单 30 RSD');
});

test('新 camelCase 兼容字段应覆盖旧 snake_case 里的 30 RSD', () => {
  const view = buildMasterShopView({
    id: 16,
    name: 'Mixed Alias Shop',
    slug: 'mixed-alias-shop',
    status: 'active',
    subscriptionDeliveryCommissionType: 'percentage',
    subscriptionDeliveryCommissionValue: 5,
    subscription_delivery_commission_type: 'per_order',
    subscription_delivery_commission_value: 30,
    businessDeliveryCommissionType: 'percentage',
    businessDeliveryCommissionValue: 6,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 30,
  });

  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 5);
  assert.equal(view.reservationPlan.displayText, '5%');
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 6);
  assert.equal(view.deliveryPlan.displayText, '6%');
  assert.equal(view.deliveryPlan.source, 'new');
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

test('编辑回包中的 enableDineIn 兼容字段也应覆盖旧开关值', () => {
  const view = buildMasterShopView({
    id: 17,
    name: 'Dine Toggle Shop',
    slug: 'dine-toggle-shop',
    enableDineIn: 0,
    enable_dine_in: 1,
  });

  assert.equal(view.enableDineIn, false);
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

test('新店缺失堂食日期时应推导默认账期', () => {
  const view = buildMasterShopView(
    {
      name: 'New DineIn Shop',
      slug: 'new-dinein-shop',
      billing_status: 'active',
      enable_dine_in: 1,
    },
    '2027-02-15',
  );

  assert.equal(view.dineInBillingStartAt, '2027-03-01');
  assert.equal(view.dineInExpiresAt, '2028-03-01');
  assert.equal(view.dineInGraceUntil, '2028-03-06');
  assert.equal(view.dineInStatusLabel, '正常');
});

test('堂食手动停用时应保留钱包风险优先且使用 muted 行风险色', () => {
  const view = buildMasterShopView(
    {
      name: 'Manual Stop Shop',
      slug: 'manual-stop-shop',
      billing_status: 'past_due',
      enable_dine_in: 0,
      dine_in_stop_reason: 'manual',
      dine_in_expires_at: '2027-03-01',
    },
    '2027-02-24',
  );

  assert.equal(view.rowTone, 'billing-overdue');
  assert.equal(view.dineInAlertLevel, 'stopped');
  assert.equal(view.dineInStatusLabel, '已停用');
  assert.equal(view.dineInRowTone, 'muted');
});

test('堂食自动关闭时应映射为 muted 行风险色', () => {
  const view = buildMasterShopView(
    {
      name: 'Auto Closed Shop',
      slug: 'auto-closed-shop',
      billing_status: 'active',
      enable_dine_in: 0,
      dine_in_stop_reason: 'auto_expired',
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-03-07',
  );

  assert.equal(view.rowTone, 'dine-in-closed');
  assert.equal(view.dineInAlertLevel, 'auto_closed');
  assert.equal(view.dineInStatusLabel, '已自动关闭');
  assert.equal(view.dineInRowTone, 'muted');
});

test('店铺视图应优先读取 businessFeeRsd 覆盖旧外卖提成', () => {
  const view = buildMasterShopView({
    id: 999,
    name: 'Alias Fee Shop',
    slug: 'alias-fee-shop',
    status: 'active',
    commission_type: 'per_order',
    commission_value: 30,
    businessFeeRsd: 5,
  });

  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
});
