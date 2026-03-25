import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterPricingSettingsPayload } from './master-pricing-settings-payload.ts';

test('settings payload keeps new plan fields and legacy aliases together', () => {
  const payload = buildMasterPricingSettingsPayload({
    reservationEnabled: '1',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.reservation_enabled, 1);
  assert.equal(payload.reservation_commission_value, 0);
  assert.equal(payload.delivery_enabled, 1);
  assert.equal(payload.delivery_commission_value, 5);
  assert.equal(payload.subscriptionDeliveryCommissionType, 'percentage');
  assert.equal(payload.businessDeliveryCommissionType, 'per_order');
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
  assert.equal(payload.businessDeliveryCommissionValue, 0);
});
