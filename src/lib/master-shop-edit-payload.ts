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

function toNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

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
  const reservationEnabled = toBoolean(input.reservationEnabled, true);
  const reservationCommissionType = toType(
    input.reservationCommissionType,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionType,
  );
  const reservationCommissionValue = toNumber(
    input.reservationCommissionValue,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
  );
  const deliveryEnabled = toBoolean(input.deliveryEnabled, true);
  const deliveryCommissionType = toType(
    input.deliveryCommissionType,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
  );
  const deliveryCommissionValue = toNumber(
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
  const defaultsReservationValue = toNumber(
    options.defaults?.reservationPlan?.commissionValue,
    MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
  );
  const defaultsDeliveryType = toType(
    options.defaults?.deliveryPlan?.commissionType,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
  );
  const defaultsDeliveryValue = toNumber(
    options.defaults?.deliveryPlan?.commissionValue,
    MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionValue,
  );

  const hasReservationOverride =
    reservationCommissionType !== defaultsReservationType || reservationCommissionValue !== defaultsReservationValue;
  const hasDeliveryOverride = deliveryCommissionType !== defaultsDeliveryType || deliveryCommissionValue !== defaultsDeliveryValue;
  const commissionMode =
    inputCommissionMode === 'global' && (hasReservationOverride || hasDeliveryOverride) ? 'override' : inputCommissionMode;

  return {
    id: toNumber(input.id, 0),
    name: buildName(input.name),
    slug: buildName(input.slug),
    password: buildName(input.password),
    status: buildName(input.status) || 'active',
    enableDelivery: toBoolean(enableDeliveryInput, true),
    enableDineIn: toBoolean(input.enableDineIn, true),
    enableReservation: toBoolean(enableReservationInput, true),
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
