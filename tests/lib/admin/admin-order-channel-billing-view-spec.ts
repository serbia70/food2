import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminOrderChannelBillingView } from '../../../src/lib/admin-order-channel-billing-view.ts';

test('override 模式优先使用 shop 覆盖值，global 模式优先使用 settings 默认值', () => {
  const overrideView = buildAdminOrderChannelBillingView(
    {
      shop: {
        commissionMode: 'override',
        reservationEnabled: 1,
        reservationCommissionType: 'per_order',
        reservationCommissionValue: 18,
        deliveryEnabled: 1,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 6,
      },
      settings: {
        reservationEnabled: 1,
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
        deliveryEnabled: 1,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
    },
    {
      reservationPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(overrideView.reservationPlan.commissionType, 'per_order');
  assert.equal(overrideView.reservationPlan.commissionValue, 18);
  assert.equal(overrideView.deliveryPlan.commissionValue, 6);

  const globalView = buildAdminOrderChannelBillingView(
    {
      shop: {
        commissionMode: 'global',
        reservationEnabled: 1,
        reservationCommissionType: 'per_order',
        reservationCommissionValue: 18,
      },
      settings: {
        reservationEnabled: 1,
        reservationCommissionType: 'percentage',
        reservationCommissionValue: 3,
        deliveryEnabled: 1,
        deliveryCommissionType: 'percentage',
        deliveryCommissionValue: 5,
      },
    },
    {
      reservationPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 3 },
      deliveryPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(globalView.reservationPlan.commissionType, 'percentage');
  assert.equal(globalView.reservationPlan.commissionValue, 3);
});

test('business 版外卖在 global 模式下优先使用 business split delivery 值', () => {
  const view = buildAdminOrderChannelBillingView(
    {
      shop: {
        commissionMode: 'global',
        billingPlanType: 'business',
      },
      settings: {
        business_delivery_commission_type: 'per_order',
        business_delivery_commission_value: 25,
        subscription_delivery_commission_type: 'percentage',
        subscription_delivery_commission_value: 5,
      },
    },
    {
      deliveryPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 5 },
    },
  );

  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.deliveryPlan.commissionValue, 25);
});

test('wallet copy 与 reminder 文案继续基于余额输出', () => {
  const view = buildAdminOrderChannelBillingView({
    billing: {
      balance_rsd: 120,
      balance_reminder_level: 'warning',
    },
  });

  assert.equal(view.billingBalanceRsd, 120);
  assert.equal(view.walletCopy, '预订 / 外卖余额：120 RSD');
  assert.equal(view.balanceReminderLevel, 'warning');
});
