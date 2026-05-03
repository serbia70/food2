import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMasterShopEditPayload,
  MASTER_SHOP_FEE_FALLBACKS,
  resetMasterShopFeeOverrides,
} from '../../../src/lib/master-shop-edit-payload.ts';

test('global 店铺修改费率后自动切到 override', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '2',
      name: 'Shop 02',
      slug: '02',
      commissionMode: 'global',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '6',
    },
    {
      defaults: {
        reservationPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'override');
  assert.equal(payload.delivery_commission_value, 6);
});

test('global 店铺未改费率时保持 global', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '4',
      name: 'Shop 04',
      slug: '04',
      commissionMode: 'global',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '5',
    },
    {
      defaults: {
        reservationPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { enabled: 1, commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'global');
});

test('显式 shop tier 时输出双写字段，不显式时不输出', () => {
  const explicitPayload = buildMasterShopEditPayload(
    {
      id: '7',
      name: 'Demo',
      slug: 'demo',
      shopTierMode: 'override',
      shopTierOverride: 'business',
    },
    {
      defaults: {
        defaultShopTier: 'subscription',
      },
    },
  );

  assert.equal(explicitPayload.shop_tier_mode, 'override');
  assert.equal(explicitPayload.shop_tier_override, 'business');
  assert.equal(explicitPayload.billing_plan_type, 'business');

  const implicitPayload = buildMasterShopEditPayload({
    id: '8',
    name: 'Demo 2',
    slug: 'demo-2',
  });

  assert.equal('shop_tier_mode' in implicitPayload, false);
  assert.equal('shop_tier_override' in implicitPayload, false);
});

test('password 继续镜像到 newPassword，reset helper 只重置费率不改启用状态', () => {
  const payload = buildMasterShopEditPayload({
    id: '9',
    name: 'Demo 3',
    slug: 'demo-3',
    password: 'abc123',
  });

  assert.equal(payload.password, 'abc123');
  assert.equal(payload.newPassword, 'abc123');

  const reset = resetMasterShopFeeOverrides(
    {
      reservationEnabled: false,
      reservationCommissionType: 'per_order',
      reservationCommissionValue: 18,
      deliveryEnabled: true,
      deliveryCommissionType: 'per_order',
      deliveryCommissionValue: 25,
    },
    {
      reservationCommissionType: MASTER_SHOP_FEE_FALLBACKS.reservationCommissionType,
      reservationCommissionValue: MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
      deliveryCommissionType: MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
      deliveryCommissionValue: MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionValue,
    },
  );

  assert.deepEqual(reset, {
    reservationEnabled: false,
    reservationCommissionType: 'percentage',
    reservationCommissionValue: 3,
    deliveryEnabled: true,
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: 5,
  });
});
