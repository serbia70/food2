import { pickFirstMeaningfulValue } from './master-value-selection.ts';
import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';

type MasterShopInput = Record<string, unknown>;

type MasterShopPlanDefaults = {
  enabled?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
};

export type MasterShopViewDefaults = {
  reservationPlan?: MasterShopPlanDefaults;
  deliveryPlan?: MasterShopPlanDefaults;
  defaultShopTier?: unknown;
};

export type MasterShopViewOptions = {
  referenceDate?: string | Date;
  defaults?: MasterShopViewDefaults;
};

export function buildReservationPlan(shop: MasterShopInput, defaults?: MasterShopViewDefaults): OrderChannelFeePlan {
  const defaultPlan = defaults?.reservationPlan || {};
  return buildOrderChannelFeePlan({
    channel: 'reservation',
    scope: 'shop',
    enabled: pickFirstMeaningfulValue(shop?.reservation_enabled, shop?.enableReservation),
    commissionType: pickFirstMeaningfulValue(
      shop?.reservation_commission_type,
      shop?.subscriptionDeliveryCommissionType,
      shop?.subscription_delivery_commission_type,
    ),
    commissionValue: pickFirstMeaningfulValue(
      shop?.reservation_commission_value,
      shop?.subscriptionDeliveryCommissionValue,
      shop?.subscriptionFeeRsd,
      shop?.subscription_delivery_commission_value,
    ),
    legacyEnabled: pickFirstMeaningfulValue(shop?.enable_reservation, shop?.subscription_enabled),
    legacyCommissionType: pickFirstMeaningfulValue(shop?.subscriptionDeliveryCommissionType, shop?.subscription_delivery_commission_type),
    legacyCommissionValue: pickFirstMeaningfulValue(shop?.subscriptionDeliveryCommissionValue, shop?.subscription_delivery_commission_value),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 3,
  });
}

export function buildDeliveryPlan(shop: MasterShopInput, defaults?: MasterShopViewDefaults): OrderChannelFeePlan {
  const defaultPlan = defaults?.deliveryPlan || {};
  const commissionMode = String(shop?.commission_mode || '').trim().toLowerCase();
  const overrideCommissionType =
    commissionMode === 'override'
      ? pickFirstMeaningfulValue(shop?.commission_override_type, shop?.commission_type)
      : undefined;
  const overrideCommissionValue =
    commissionMode === 'override'
      ? pickFirstMeaningfulValue(shop?.commission_override_value, shop?.commission_value)
      : undefined;

  return buildOrderChannelFeePlan({
    channel: 'delivery',
    scope: 'shop',
    enabled: pickFirstMeaningfulValue(shop?.delivery_enabled, shop?.enableDelivery),
    commissionType: pickFirstMeaningfulValue(
      shop?.delivery_commission_type,
      shop?.businessDeliveryCommissionType,
      shop?.business_delivery_commission_type,
      overrideCommissionType,
    ),
    commissionValue: pickFirstMeaningfulValue(
      shop?.delivery_commission_value,
      shop?.businessDeliveryCommissionValue,
      overrideCommissionValue,
      shop?.businessFeeRsd,
      shop?.business_delivery_commission_value,
    ),
    legacyEnabled: pickFirstMeaningfulValue(shop?.enable_delivery, shop?.business_enabled),
    legacyCommissionType: pickFirstMeaningfulValue(shop?.businessDeliveryCommissionType, shop?.business_delivery_commission_type),
    legacyCommissionValue: pickFirstMeaningfulValue(shop?.businessDeliveryCommissionValue, shop?.business_delivery_commission_value),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 5,
  });
}

export function resolveShopViewOptions(value?: string | Date | MasterShopViewOptions) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return {
      referenceDate: value.referenceDate,
      defaults: value.defaults,
    };
  }

  return {
    referenceDate: value,
    defaults: undefined,
  };
}
