import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminOrderChannelBillingView } from './admin-order-channel-billing-view.ts';

test('admin view shows current values and no monthly charge copy', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: { balance_rsd: 1800, billing_alert_level: 'normal' },
      reservation_commission_value: 0,
      reservation_commission_type: 'percentage',
      delivery_commission_value: 5,
      delivery_commission_type: 'percentage',
    },
    {
      reservation_commission_value: 3,
      reservation_commission_type: 'percentage',
      delivery_commission_value: 5,
      delivery_commission_type: 'percentage',
    },
  );

  assert.equal(view.billingBalanceRsd, 1800);
  assert.equal(view.walletCopy.includes('每月1号'), false);
  assert.equal(view.walletHint.includes('堂食年费'), true);
  assert.equal(view.balanceReminderText.includes('每月1号'), false);
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.balanceReminderLevel, 'normal');
});

test('admin view falls back to split legacy values when new fields are absent', () => {
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

  assert.equal(view.reservationPlan.commissionType, 'per_order');
  assert.equal(view.reservationPlan.commissionValue, 18);
  assert.equal(view.reservationPlan.source, 'legacy');
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 6);
  assert.equal(view.deliveryPlan.source, 'legacy');
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
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: 'override',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 6,
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

test('shop commission_mode 为空时应继续回退到 settings override', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: '',
      },
      settings: {
        commission_mode: 'override',
        commission_override_type: 'percentage',
        commission_override_value: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('reservation 0 值不能被空字符串 billing 覆盖掉', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 1800,
        billing_alert_level: 'normal',
        reservation_commission_type: '',
        reservation_commission_value: '',
      },
      shop: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 0,
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
        reservation_commission_type: 'percentage',
        reservation_commission_value: 2,
      },
      shop: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 4,
      },
      settings: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 3,
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
        reservation_commission_type: 'percentage',
        reservation_commission_value: 2,
      },
      shop: {},
      settings: {
        reservation_commission_type: 'percentage',
        reservation_commission_value: 3,
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

test('shop commission_mode 为 null 时应继续回退到 settings override', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: null,
      },
      settings: {
        commission_mode: 'override',
        commission_override_type: 'percentage',
        commission_override_value: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('非法 shop commission_mode 应继续回退到 settings override', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: 'manual',
      },
      settings: {
        commission_mode: 'override',
        commission_override_type: 'percentage',
        commission_override_value: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '6%');
});

test('shop 与 settings 的非法 commission_mode 都应回退到 global delivery 字段', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 5000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        commission_mode: 'manual',
      },
      settings: {
        commission_mode: 'custom',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 7,
        commission_override_type: 'percentage',
        commission_override_value: 6,
      },
    },
    {
      reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { commissionType: 'percentage', commissionValue: 4 },
    },
  );

  assert.equal(view.deliveryPlan.displayText, '7%');
  assert.equal(view.deliveryPlan.commissionValue, 7);
});

test('settings legacy reservation 字段应优先于 billing', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        reservation_commission_type: 'percentage',
        reservation_commission_value: 2,
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

  assert.equal(view.reservationPlan.displayText, '每单 18 RSD');
  assert.equal(view.reservationPlan.source, 'legacy');
});

test('billing legacy delivery 字段在 shop 与 settings 缺失时生效', () => {
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

  assert.equal(view.deliveryPlan.displayText, '8%');
  assert.equal(view.deliveryPlan.source, 'legacy');
});

test('delivery 0 值不能被 settings 与 billing 覆盖掉', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      billing: {
        balance_rsd: 3000,
        billing_alert_level: 'normal',
        delivery_commission_type: 'percentage',
        delivery_commission_value: 5,
      },
      shop: {
        delivery_commission_type: 'percentage',
        delivery_commission_value: 0,
      },
      settings: {
        delivery_commission_type: 'percentage',
        delivery_commission_value: 6,
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
