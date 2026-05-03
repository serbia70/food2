import { toNormalizedBoolean, toNormalizedNumber } from './master-field-normalizers.ts';

export const MASTER_SHOP_FEE_FALLBACKS = {
  reservationCommissionType: 'percentage',
  reservationCommissionValue: 3,
  deliveryCommissionType: 'percentage',
  deliveryCommissionValue: 5,
} as const;

export type MasterShopEditDefaults = {
  reservationPlan?: {
    enabled?: unknown;
    commissionType?: unknown;
    commissionValue?: unknown;
  };
  deliveryPlan?: {
    enabled?: unknown;
    commissionType?: unknown;
    commissionValue?: unknown;
  };
  defaultShopTier?: unknown;
};

export type MasterShopEditPayloadOptions = {
  defaults?: MasterShopEditDefaults;
};

export function toType(value: unknown, fallback = 'percentage'): string {
  const raw = String(value ?? '').trim();
  if (raw === 'percentage' || raw === 'per_order') return raw;
  return fallback;
}

export function buildName(value: unknown): string {
  return String(value ?? '').trim();
}

export function toCommissionMode(value: unknown, fallback = 'override'): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'global' || raw === 'override') return raw;
  return fallback;
}

export function toShopTier(value: unknown, fallback: 'subscription' | 'business' = 'subscription') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'subscription' || raw === 'business') return raw;
  return fallback;
}

export function toShopTierMode(value: unknown, fallback: 'global' | 'override' = 'global') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'global' || raw === 'override') return raw;
  return fallback;
}

export function resolveCommissionDefaults(defaults?: MasterShopEditDefaults) {
  return {
    reservationType: toType(
      defaults?.reservationPlan?.commissionType,
      MASTER_SHOP_FEE_FALLBACKS.reservationCommissionType,
    ),
    reservationValue: toNormalizedNumber(
      defaults?.reservationPlan?.commissionValue,
      MASTER_SHOP_FEE_FALLBACKS.reservationCommissionValue,
    ),
    deliveryType: toType(
      defaults?.deliveryPlan?.commissionType,
      MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionType,
    ),
    deliveryValue: toNormalizedNumber(
      defaults?.deliveryPlan?.commissionValue,
      MASTER_SHOP_FEE_FALLBACKS.deliveryCommissionValue,
    ),
    reservationEnabled: toNormalizedBoolean(defaults?.reservationPlan?.enabled, true),
    deliveryEnabled: toNormalizedBoolean(defaults?.deliveryPlan?.enabled, true),
    defaultShopTier: toShopTier(defaults?.defaultShopTier, 'subscription'),
  };
}

export function resolveEffectiveCommissionMode(input: {
  inputCommissionMode: string;
  reservationEnabled: boolean;
  reservationCommissionType: string;
  reservationCommissionValue: number;
  deliveryEnabled: boolean;
  deliveryCommissionType: string;
  deliveryCommissionValue: number;
  defaults: ReturnType<typeof resolveCommissionDefaults>;
}): string {
  const hasReservationOverride =
    input.reservationEnabled !== input.defaults.reservationEnabled ||
    input.reservationCommissionType !== input.defaults.reservationType ||
    input.reservationCommissionValue !== input.defaults.reservationValue;
  const hasDeliveryOverride =
    input.deliveryEnabled !== input.defaults.deliveryEnabled ||
    input.deliveryCommissionType !== input.defaults.deliveryType ||
    input.deliveryCommissionValue !== input.defaults.deliveryValue;

  return input.inputCommissionMode === 'global' && (hasReservationOverride || hasDeliveryOverride)
    ? 'override'
    : input.inputCommissionMode;
}
