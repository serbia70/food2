import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterPricingSettingsPayload } from './master-pricing-settings-payload.ts';

test('settings payload keeps admin-readable canonical plan fields together with backend aliases', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.reservation_enabled, 1);
  assert.equal(payload.enable_reservation, 1);
  assert.equal(payload.reservation_commission_type, 'percentage');
  assert.equal(payload.reservation_commission_value, 0);
  assert.equal(payload.delivery_enabled, 1);
  assert.equal(payload.delivery_commission_type, 'per_order');
  assert.equal(payload.delivery_commission_value, 5);
  assert.equal(payload.reservationCommissionType, 'percentage');
  assert.equal(payload.reservationCommissionValue, 0);
  assert.equal(payload.deliveryCommissionType, 'per_order');
  assert.equal(payload.deliveryCommissionValue, 5);
  assert.equal(payload.subscriptionDeliveryCommissionType, 'per_order');
  assert.equal(payload.subscription_delivery_commission_type, 'per_order');
  assert.equal(payload.subscriptionDeliveryCommissionValue, 5);
  assert.equal(payload.subscription_delivery_commission_value, 5);
  assert.equal(payload.businessDeliveryCommissionType, 'per_order');
  assert.equal(payload.business_delivery_commission_type, 'per_order');
  assert.equal(payload.businessDeliveryCommissionValue, 5);
  assert.equal(payload.business_delivery_commission_value, 5);
  assert.equal(payload.subscriptionFeeRsd, 0);
  assert.equal(payload.businessFeeRsd, 5);
});

test('settings payload preserves zero values when fields are empty strings', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '',
    reservationCommissionType: '',
    reservationCommissionValue: '0',
    deliveryEnabled: '',
    deliveryCommissionType: '',
    deliveryCommissionValue: '0',
  });

  assert.equal(payload.reservation_commission_value, 0);
  assert.equal(payload.delivery_commission_value, 0);
  assert.equal(payload.subscriptionDeliveryCommissionValue, 0);
  assert.equal(payload.subscription_delivery_commission_value, 0);
  assert.equal(payload.businessDeliveryCommissionValue, 0);
  assert.equal(payload.business_delivery_commission_value, 0);
});

test('settings payload includes both default shop tier keys only when explicitly provided', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
    defaultShopTier: 'business',
  });

  assert.equal(payload.default_shop_tier, 'business');
  assert.equal(payload.defaultShopTier, 'business');

  const payloadWithoutTier = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal('default_shop_tier' in payloadWithoutTier, false);
  assert.equal('defaultShopTier' in payloadWithoutTier, false);
});

test('settings payload omits default_shop_tier when field is not submitted', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal('default_shop_tier' in payload, false);
  assert.equal('defaultShopTier' in payload, false);
});

test('settings payload accepts invalid default_shop_tier and defaults to subscription', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
    defaultShopTier: 'invalid',
  });

  assert.equal(payload.default_shop_tier, 'subscription');
});
