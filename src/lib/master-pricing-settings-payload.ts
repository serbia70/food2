import { toNormalizedBoolean, toNormalizedNumber } from './master-field-normalizers.ts';

type MasterPricingSettingsInput = Record<string, unknown>;

function toType(value: unknown, fallback = 'percentage'): string {
  const raw = String(value ?? '').trim();
  if (raw === 'percentage' || raw === 'per_order') return raw;
  return fallback;
}

export function buildMasterPricingSettingsPayload(input: MasterPricingSettingsInput) {
  const reservationEnabled = toNormalizedBoolean(input.reservationEnabled, true);
  const reservationCommissionType = toType(input.reservationCommissionType, 'percentage');
  const reservationCommissionValue = toNormalizedNumber(input.reservationCommissionValue, 3);
  const deliveryEnabled = toNormalizedBoolean(input.deliveryEnabled, true);
  const deliveryCommissionType = toType(input.deliveryCommissionType, 'percentage');
  const deliveryCommissionValue = toNormalizedNumber(input.deliveryCommissionValue, 5);
  const hasDefaultShopTier = input.defaultShopTier !== undefined && String(input.defaultShopTier ?? '').trim() !== '';
  const defaultShopTier = toDefaultShopTier(input.defaultShopTier);

  return {
    reservation_enabled: reservationEnabled ? 1 : 0,
    enable_reservation: reservationEnabled ? 1 : 0,
    reservation_commission_type: reservationCommissionType,
    reservation_commission_value: reservationCommissionValue,
    delivery_enabled: deliveryEnabled ? 1 : 0,
    delivery_commission_type: deliveryCommissionType,
    delivery_commission_value: deliveryCommissionValue,
    reservationCommissionType,
    reservationCommissionValue,
    deliveryCommissionType,
    deliveryCommissionValue,
    subscriptionFeeRsd: reservationCommissionValue,
    businessFeeRsd: deliveryCommissionValue,
    subscriptionDeliveryCommissionType: deliveryCommissionType,
    subscription_delivery_commission_type: deliveryCommissionType,
    subscriptionDeliveryCommissionValue: deliveryCommissionValue,
    subscription_delivery_commission_value: deliveryCommissionValue,
    businessDeliveryCommissionType: deliveryCommissionType,
    business_delivery_commission_type: deliveryCommissionType,
    businessDeliveryCommissionValue: deliveryCommissionValue,
    business_delivery_commission_value: deliveryCommissionValue,
    reservationEnabled,
    deliveryEnabled,
    ...(hasDefaultShopTier ? {
      defaultShopTier,
      default_shop_tier: defaultShopTier,
    } : {}),
  };
}

function toDefaultShopTier(value: unknown): 'subscription' | 'business' {
  const raw = String(value ?? '').trim();
  if (raw === 'subscription' || raw === 'business') return raw;
  return 'subscription';
}
