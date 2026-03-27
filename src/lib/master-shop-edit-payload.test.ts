import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterShopEditPayload, resetMasterShopFeeOverrides } from './master-shop-edit-payload.ts';

test('reset only rewrites fee values and keeps enabled flags', () => {
  const state = resetMasterShopFeeOverrides(
    {
      reservationEnabled: true,
      reservationCommissionType: 'per_order',
      reservationCommissionValue: 18,
      deliveryEnabled: false,
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: 5,
    },
    {
      reservationCommissionType: 'percentage',
      reservationCommissionValue: 0,
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: 3,
    },
  );

  assert.equal(state.reservationEnabled, true);
  assert.equal(state.deliveryEnabled, false);
  assert.equal(state.reservationCommissionType, 'percentage');
  assert.equal(state.reservationCommissionValue, 0);
  assert.equal(state.deliveryCommissionType, 'percentage');
  assert.equal(state.deliveryCommissionValue, 3);
});

test('shop payload keeps split plan fields and compatibility aliases', () => {
  const payload = buildMasterShopEditPayload({
    id: '7',
    name: 'Demo Shop',
    slug: 'demo-shop',
    password: '',
    status: 'active',
    enableDelivery: '1',
    enableDineIn: '0',
    enableReservation: '1',
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '0',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.id, 7);
  assert.equal(payload.name, 'Demo Shop');
  assert.equal(payload.reservation_enabled, 1);
  assert.equal(payload.reservation_commission_value, 0);
  assert.equal(payload.delivery_enabled, 0);
  assert.equal(payload.delivery_commission_value, 5);
  assert.equal(payload.subscription_enabled, 1);
  assert.equal(payload.subscription_delivery_commission_type, 'percentage');
  assert.equal(payload.subscription_delivery_commission_value, 0);
  assert.equal(payload.business_enabled, 0);
  assert.equal(payload.business_delivery_commission_type, 'per_order');
  assert.equal(payload.business_delivery_commission_value, 5);
  assert.equal(payload.subscriptionFeeRsd, 0);
  assert.equal(payload.businessFeeRsd, 5);
  assert.equal(payload.subscriptionDeliveryCommissionType, 'percentage');
  assert.equal(payload.subscriptionDeliveryCommissionValue, 0);
  assert.equal(payload.businessDeliveryCommissionType, 'per_order');
  assert.equal(payload.businessDeliveryCommissionValue, 5);
  assert.equal(payload.commission_type, 'per_order');
  assert.equal(payload.commission_value, 5);
  assert.equal(payload.enableDelivery, true);
  assert.equal(payload.enableReservation, true);
  assert.equal(payload.enable_reservation, 1);
  assert.equal(payload.commissionMode, 'override');
});

test('missing enableDelivery and enableReservation fallback to deliveryEnabled and reservationEnabled while keeping enableDineIn', () => {
  const payload = buildMasterShopEditPayload({
    id: '8',
    name: 'Fallback Shop',
    slug: 'fallback-shop',
    enableDineIn: '0',
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '3',
    deliveryEnabled: '0',
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.enableReservation, true);
  assert.equal(payload.enableDelivery, false);
  assert.equal(payload.enableDineIn, false);
});

test('global mode switches to override when delivery fee differs from defaults', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '9',
      name: 'Global Shop',
      slug: 'global-shop',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '8',
      commissionMode: 'global',
    },
    {
      defaults: {
        reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'override');
});

test('global mode stays global when fees are unchanged from defaults', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '10',
      name: 'Global Shop No Change',
      slug: 'global-shop-no-change',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '5',
      commissionMode: 'global',
    },
    {
      defaults: {
        reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'global');
});

test('global mode switches to override when reservation enabled flag differs from defaults', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '10',
      name: 'Global Shop Toggle Change',
      slug: 'global-shop-toggle-change',
      reservationEnabled: '0',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '5',
      commissionMode: 'global',
    },
    {
      defaults: {
        reservationPlan: { enabled: true, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: true, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'override');
});

test('global mode stays global after resetting fee fields back to defaults', () => {
  const reset = resetMasterShopFeeOverrides(
    {
      reservationEnabled: true,
      reservationCommissionType: 'per_order',
      reservationCommissionValue: 99,
      deliveryEnabled: true,
      deliveryCommissionType: 'per_order',
      deliveryCommissionValue: 88,
    },
    {
      reservationCommissionType: 'percentage',
      reservationCommissionValue: 3,
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: 5,
    },
  );

  const payload = buildMasterShopEditPayload(
    {
      id: '11',
      name: 'Global Shop Reset',
      slug: 'global-shop-reset',
      reservationEnabled: reset.reservationEnabled,
      reservationCommissionType: reset.reservationCommissionType,
      reservationCommissionValue: reset.reservationCommissionValue,
      deliveryEnabled: reset.deliveryEnabled,
      deliveryCommissionType: reset.deliveryCommissionType,
      deliveryCommissionValue: reset.deliveryCommissionValue,
      commissionMode: 'global',
    },
    {
      defaults: {
        reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'global');
});

test('shop edit payload keeps legacy manage contract fields for update_shop', () => {
  const payload = buildMasterShopEditPayload({
    id: '12',
    name: 'Manage Shop',
    slug: 'manage-shop',
    password: 'next-pass',
    status: 'active',
    enableDelivery: '0',
    enableDineIn: '1',
    enableReservation: '0',
    reservationEnabled: '0',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '3',
    deliveryEnabled: '0',
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: '5',
    commissionMode: 'override',
  });

  assert.equal(payload.newPassword, 'next-pass');
  assert.equal(payload.enableReservation, false);
  assert.equal(payload.enableDelivery, false);
  assert.equal(payload.enableDineIn, true);
  assert.equal(payload.commissionType, 'percentage');
  assert.equal(payload.commissionValue, 5);
});
