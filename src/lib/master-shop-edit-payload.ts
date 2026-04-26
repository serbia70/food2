import { toNormalizedBoolean, toNormalizedNumber } from './master-field-normalizers.ts';
import {
  buildName,
  MASTER_SHOP_FEE_FALLBACKS,
  resolveCommissionDefaults,
  resolveEffectiveCommissionMode,
  toCommissionMode,
  toShopTier,
  toShopTierMode,
  toType,
  type MasterShopEditDefaults,
  type MasterShopEditPayloadOptions,
} from './master-shop-edit-payload-helpers.ts';

type MasterShopEditInput = Record<string, unknown>;

export { MASTER_SHOP_FEE_FALLBACKS };
export type { MasterShopEditDefaults, MasterShopEditPayloadOptions };

export function buildMasterShopEditPayload(input: MasterShopEditInput, options: MasterShopEditPayloadOptions = {}) {
  const reservationEnabled = toNormalizedBoolean(input.reservationEnabled, true);
  const reservationCommissionType = toType(
    input.reservationCommissionType,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionType,
  );
  const reservationCommissionValue = toNormalizedNumber(
    input.reservationCommissionValue,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
  );
  const deliveryEnabled = toNormalizedBoolean(input.deliveryEnabled, true);
  const deliveryCommissionType = toType(
    input.deliveryCommissionType,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
  );
  const deliveryCommissionValue = toNormalizedNumber(
    input.deliveryCommissionValue,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionValue,
  );
  const inputCommissionMode = toCommissionMode(input.commissionMode, 'override');
  const enableDeliveryInput = input.enableDelivery ?? input.deliveryEnabled;
  const enableReservationInput = input.enableReservation ?? input.reservationEnabled;
  const defaults = resolveCommissionDefaults(options.defaults);
  const commissionMode = resolveEffectiveCommissionMode({
    inputCommissionMode,
    reservationEnabled,
    reservationCommissionType,
    reservationCommissionValue,
    deliveryEnabled,
    deliveryCommissionType,
    deliveryCommissionValue,
    defaults,
  });

  const password = buildName(input.password);
  const hasShopTierMode = input.shopTierMode !== undefined && String(input.shopTierMode ?? '').trim() !== '';
  const hasShopTierOverride = input.shopTierOverride !== undefined && String(input.shopTierOverride ?? '').trim() !== '';
  const hasExplicitShopTier = hasShopTierMode || hasShopTierOverride;
  const shopTierMode = toShopTierMode(input.shopTierMode, 'global');
  const shopTierOverride = toShopTier(input.shopTierOverride, defaults.defaultShopTier);
  const effectiveShopTier = shopTierMode === 'override' ? shopTierOverride : defaults.defaultShopTier;

  return {
    id: toNormalizedNumber(input.id, 0),
    name: buildName(input.name),
    slug: buildName(input.slug),
    password,
    newPassword: password,
    status: buildName(input.status) || 'active',
    enableDelivery: toNormalizedBoolean(enableDeliveryInput, true),
    enableDineIn: toNormalizedBoolean(input.enableDineIn, true),
    enableReservation: toNormalizedBoolean(enableReservationInput, true),
    enable_reservation: reservationEnabled ? 1 : 0,
    reservation_enabled: reservationEnabled ? 1 : 0,
    reservation_commission_type: reservationCommissionType,
    reservation_commission_value: reservationCommissionValue,
    delivery_enabled: deliveryEnabled ? 1 : 0,
    delivery_commission_type: deliveryCommissionType,
    delivery_commission_value: deliveryCommissionValue,
    subscription_enabled: reservationEnabled ? 1 : 0,
    subscription_delivery_commission_type: deliveryCommissionType,
    subscription_delivery_commission_value: deliveryCommissionValue,
    business_enabled: deliveryEnabled ? 1 : 0,
    business_delivery_commission_type: deliveryCommissionType,
    business_delivery_commission_value: deliveryCommissionValue,
    commissionMode,
    commissionType: deliveryCommissionType,
    commissionValue: deliveryCommissionValue,
    commission_type: deliveryCommissionType,
    commission_value: deliveryCommissionValue,
    subscriptionFeeRsd: reservationCommissionValue,
    businessFeeRsd: deliveryCommissionValue,
    subscriptionDeliveryCommissionType: deliveryCommissionType,
    subscriptionDeliveryCommissionValue: deliveryCommissionValue,
    businessDeliveryCommissionType: deliveryCommissionType,
    businessDeliveryCommissionValue: deliveryCommissionValue,
    ...(hasExplicitShopTier ? {
      billingPlanType: effectiveShopTier,
      billing_plan_type: effectiveShopTier,
      planType: effectiveShopTier,
      plan_type: effectiveShopTier,
      shopTierMode,
      shopTierOverride,
      shop_tier_mode: shopTierMode,
      shop_tier_override: shopTierOverride,
    } : {}),
  };
}

export function resetMasterShopFeeOverrides(
  current: {
    reservationEnabled: boolean;
    reservationCommissionType: string;
    reservationCommissionValue: number;
    deliveryEnabled: boolean;
    deliveryCommissionType: string;
    deliveryCommissionValue: number;
  },
  defaults: {
    reservationCommissionType: string;
    reservationCommissionValue: number;
    deliveryCommissionType: string;
    deliveryCommissionValue: number;
  },
) {
  return {
    reservationEnabled: current.reservationEnabled,
    reservationCommissionType: defaults.reservationCommissionType,
    reservationCommissionValue: defaults.reservationCommissionValue,
    deliveryEnabled: current.deliveryEnabled,
    deliveryCommissionType: defaults.deliveryCommissionType,
    deliveryCommissionValue: defaults.deliveryCommissionValue,
  };
}
