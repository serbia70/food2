type MasterPricingSettingsInput = Record<string, unknown>;

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

export function buildMasterPricingSettingsPayload(input: MasterPricingSettingsInput) {
  const reservationEnabled = toBoolean(input.reservationEnabled, true);
  const reservationCommissionType = toType(input.reservationCommissionType, 'percentage');
  const reservationCommissionValue = toNumber(input.reservationCommissionValue, 3);
  const deliveryEnabled = toBoolean(input.deliveryEnabled, true);
  const deliveryCommissionType = toType(input.deliveryCommissionType, 'percentage');
  const deliveryCommissionValue = toNumber(input.deliveryCommissionValue, 5);

  return {
    reservation_enabled: reservationEnabled ? 1 : 0,
    reservation_commission_type: reservationCommissionType,
    reservation_commission_value: reservationCommissionValue,
    delivery_enabled: deliveryEnabled ? 1 : 0,
    delivery_commission_type: deliveryCommissionType,
    delivery_commission_value: deliveryCommissionValue,
    subscriptionFeeRsd: reservationCommissionValue,
    businessFeeRsd: deliveryCommissionValue,
    subscriptionDeliveryCommissionType: reservationCommissionType,
    subscriptionDeliveryCommissionValue: reservationCommissionValue,
    businessDeliveryCommissionType: deliveryCommissionType,
    businessDeliveryCommissionValue: deliveryCommissionValue,
    reservationEnabled,
    deliveryEnabled,
  };
}
