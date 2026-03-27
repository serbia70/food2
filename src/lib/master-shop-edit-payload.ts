import { toNormalizedBoolean, toNormalizedNumber } from './master-field-normalizers.ts';

type MasterShopEditInput = Record<string, unknown>;

export const MASTER_SHOP_FEE_FALLBACKS = {
  reservationCommissionType: 'percentage',
  reservationCommissionValue: 3,
  deliveryCommissionType: 'percentage',
  deliveryCommissionValue: 5,
} as const;

type MasterShopEditDefaults = {
  reservationPlan?: {
    commissionType?: unknown;
    commissionValue?: unknown;
  };
  deliveryPlan?: {
    commissionType?: unknown;
    commissionValue?: unknown;
  };
};

type MasterShopEditPayloadOptions = {
  defaults?: MasterShopEditDefaults;
};

function toType(value: unknown, fallback = 'percentage'): string {
  const raw = String(value ?? '').trim();
  if (raw === 'percentage' || raw === 'per_order') return raw;
  return fallback;
}

function buildName(value: unknown): string {
  return String(value ?? '').trim();
}

function toCommissionMode(value: unknown, fallback = 'override'): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'global' || raw === 'override') return raw;
  return fallback;
}

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

  const defaultsReservationType = toType(
    options.defaults?.reservationPlan?.commissionType,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionType,
  );
  const defaultsReservationValue = toNormalizedNumber(
    options.defaults?.reservationPlan?.commissionValue,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
  );
  const defaultsDeliveryType = toType(
    options.defaults?.deliveryPlan?.commissionType,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
  );
  const defaultsDeliveryValue = toNormalizedNumber(
    options.defaults?.deliveryPlan?.commissionValue,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionValue,
  );

  const defaultsReservationEnabled = toNormalizedBoolean(options.defaults?.reservationPlan?.enabled, true);
  const defaultsDeliveryEnabled = toNormalizedBoolean(options.defaults?.deliveryPlan?.enabled, true);

  const hasReservationOverride =
    reservationEnabled !== defaultsReservationEnabled ||
    reservationCommissionType !== defaultsReservationType ||
    reservationCommissionValue !== defaultsReservationValue;
  const hasDeliveryOverride =
    deliveryEnabled !== defaultsDeliveryEnabled ||
    deliveryCommissionType !== defaultsDeliveryType ||
    deliveryCommissionValue !== defaultsDeliveryValue;
  const commissionMode =
    inputCommissionMode === 'global' && (hasReservationOverride || hasDeliveryOverride) ? 'override' : inputCommissionMode;

  const password = buildName(input.password);

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
    subscription_delivery_commission_type: reservationCommissionType,
    subscription_delivery_commission_value: reservationCommissionValue,
    business_enabled: deliveryEnabled ? 1 : 0,
    business_delivery_commission_type: deliveryCommissionType,
    business_delivery_commission_value: deliveryCommissionValue,
    commissionMode: commissionMode,
    commissionType: deliveryCommissionType,
    commissionValue: deliveryCommissionValue,
    commission_type: deliveryCommissionType,
    commission_value: deliveryCommissionValue,
    subscriptionFeeRsd: reservationCommissionValue,
    businessFeeRsd: deliveryCommissionValue,
    subscriptionDeliveryCommissionType: reservationCommissionType,
    subscriptionDeliveryCommissionValue: reservationCommissionValue,
    businessDeliveryCommissionType: deliveryCommissionType,
    businessDeliveryCommissionValue: deliveryCommissionValue,
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
