import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminOrderChannelBillingView } from './admin-order-channel-billing-view.ts';

test('admin view shows current values and no monthly charge copy', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: { balance_rsd: 1800, billing_alert_level: 'normal' },
      shop: {
        reservationCommissionValue: 0,
        reservationCommissionType: 'percentage',
        deliveryCommissionValue: 5,
        deliveryCommissionType: 'percentage',
      },
    },
    {
      reservationPlan: { commissionValue: 3, commissionType: 'percentage' },
      deliveryPlan: { commissionValue: 5, commissionType: 'percentage' },
    },
  );

  assert.equal(view.billingBalanceRsd, 1800);
  assert.equal(view.walletCopy.includes('每月1号'), false);
  assert.equal(view.walletHint.includes('堂食年费'), true);
  assert.equal(view.balanceReminderText.includes('每月1号'), false);
  assert.equal(view.balanceReminderText.includes('当前 1800 RSD'), false);
  assert.equal(view.balanceReminderText, '');
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.balanceReminderLevel, 'normal');
});

test('admin view ignores split legacy values when canonical fields are absent', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: { balance_rsd: -420, billing_alert_level: 'overdue' },
      subscription_delivery_commission_type: 'per_order',
      subscription_delivery_commission_value: 18,
      business_delivery_commission_type: 'percentage',
      business_delivery_commission_value: 6,
    },
    {},
  );

  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 3);
  assert.equal(view.reservationPlan.source, 'default');
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.source, 'default');
  assert.equal(view.balanceReminderLevel, 'overdue');
});

test('admin view ignores legacy flat commission fallback', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: { balance_rsd: 1200, billing_alert_level: 'normal' },
      commission_type: 'per_order',
      commission_value: 30,
    },
    {},
  );

  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.reservationPlan.source, 'default');
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'default');
  assert.equal(view.balanceReminderLevel, 'normal');
});

test('shop 外卖覆盖值必须压过 stale billing 快照', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      shop: {
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 6,
      },
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
  assert.equal(view.deliveryPlan.commissionValue, 6);
});

test('settings canonical delivery 字段在 shop 缺失时应生效', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      shop: {},
      settings: {
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('settings snake_case 全局提成字段在 shop 与 canonical settings 缺失时应生效', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
      },
      shop: {},
      settings: {
        reservation_enabled: 1,
        reservation_commission_type: 'per_order',
        reservation_commission_value: 12,
        delivery_enabled: 1,
        delivery_commission_type: 'percentage',
        delivery_commission_value: 6,
      },
    },
    {
      reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.displayText, '每单 12 RSD');
  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('settings split 全局提成字段在 canonical 缺失时应压过 stale billing 快照', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 14948,
        billing_alert_level: 'normal',
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      shop: {
        billingPlanType: 'business',
      },
      settings: {
        subscription_delivery_commission_type: 'percentage',
        subscription_delivery_commission_value: 3,
        business_delivery_commission_type: 'percentage',
        business_delivery_commission_value: 7,
      },
    },
    {
      reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.deliveryPlan.displayText, '7%');
  assert.equal(view.deliveryPlan.commissionValue, 7);
});

test('reservation 0 值不能被空字符串 billing 覆盖掉', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 1800,
        billing_alert_level: 'normal',
        reservationCommissionType: '',
        reservationCommissionValue: '',
      },
      shop: {
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 0,
      },
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '免费');
});

test('reservation 店铺值应优先于 settings 与 billing', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 2,
      },
      shop: {
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 4,
      },
      settings: {
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '4%');
  assert.equal(view.reservationPlan.commissionValue, 4);
});

test('reservation 在 shop 缺失时应回退到 settings', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 2,
      },
      shop: {},
      settings: {
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 1 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.reservationPlan.commissionValue, 3);
});

test('reservation legacy enable_reservation 不再生效', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: { balance_rsd: 1800, billing_alert_level: 'normal' },
      shop: {
        enable_reservation: 0,
      },
      settings: {},
    },
    {
      reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.enabled, true);
});

test('settings legacy reservation 字段不再优先于 billing', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 2,
      },
      shop: {},
      settings: {
        subscription_delivery_commission_type: 'per_order',
        subscription_delivery_commission_value: 18,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '2%');
  assert.equal(view.reservationPlan.source, 'new');
});

test('billing legacy delivery 字段在 shop 与 settings 缺失时不再生效', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        business_delivery_commission_type: 'percentage',
        business_delivery_commission_value: 8,
      },
      shop: {},
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'default');
});

test('delivery 0 值不能被 settings 与 billing 覆盖掉', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      shop: {
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 0,
      },
      settings: {
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '免费');
  assert.equal(view.deliveryPlan.commissionValue, 0);
});

test('commission_mode 为 global 且存在 split 外卖设置时应优先使用 split 全局 settings', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 14948,
        billing_alert_level: 'normal',
      },
      shop: {
        commission_mode: 'global',
        billingPlanType: 'subscription',
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      settings: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 3,
        delivery_commission_type: 'percentage',
        delivery_commission_value: 7,
        subscription_delivery_commission_type: 'percentage',
        subscription_delivery_commission_value: 3,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.deliveryPlan.displayText, '3%');
  assert.equal(view.deliveryPlan.commissionValue, 3);
});

test('commissionMode camelCase 为 global 时也应优先使用全局 settings 提成', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 14948,
        billing_alert_level: 'normal',
      },
      shop: {
        commissionMode: 'global',
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
      settings: {
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 7,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.deliveryPlan.displayText, '7%');
  assert.equal(view.deliveryPlan.commissionValue, 7);
});

test('缺失全部来源时应回退默认值', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 0,
        billing_alert_level: 'normal',
      },
      shop: {},
      settings: {},
    },
    {
      reservationPlan: { commissionType: 'per_order', commissionValue: 11 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 4 },
    },
  );

  assert.equal(view.reservationPlan.displayText, '每单 11 RSD');
  assert.equal(view.reservationPlan.source, 'default');
  assert.equal(view.deliveryPlan.displayText, '4%');
  assert.equal(view.deliveryPlan.source, 'default');
});
