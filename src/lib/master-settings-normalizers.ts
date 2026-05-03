import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';

type MasterSettingsInput = Record<string, unknown>;

export function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function toPositiveNumber(value: unknown, fallback: number): number {
  const num = toNumber(value, fallback);
  return num > 0 ? num : fallback;
}

export function pickSetting(settings: MasterSettingsInput, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in settings) return settings[key];
  }
  return undefined;
}

export function pickSettingFromNestedObject(
  settings: MasterSettingsInput,
  parentKeys: string[],
  childKeys: string[],
): unknown {
  for (const parentKey of parentKeys) {
    const parent = settings[parentKey];
    if (!parent || typeof parent !== 'object') continue;
    const parentRecord = parent as Record<string, unknown>;
    for (const childKey of childKeys) {
      if (childKey in parentRecord) return parentRecord[childKey];
    }
  }
  return undefined;
}

export function toStringValue(value: unknown): string {
  return String(value ?? '').trim();
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function toDefaultShopTier(value: unknown): 'subscription' | 'business' {
  const raw = String(value ?? '').trim();
  if (raw === 'subscription' || raw === 'business') return raw;
  return 'subscription';
}

export function resolveDefaultShopTier(settings: MasterSettingsInput): 'subscription' | 'business' {
  return toDefaultShopTier(pickSetting(settings, 'defaultShopTier', 'default_shop_tier'));
}

export function toChoice(value: unknown, allowed: string[], fallback: string): string {
  const raw = String(value ?? '').trim();
  return allowed.includes(raw) ? raw : fallback;
}

export function toJsonString(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

export function buildReservationPlan(settings: MasterSettingsInput): OrderChannelFeePlan {
  return buildOrderChannelFeePlan({
    channel: 'reservation',
    enabled: pickSetting(settings, 'reservationEnabled', 'reservation_enabled'),
    commissionType: pickSetting(settings, 'reservationCommissionType', 'reservation_commission_type'),
    commissionValue: pickSetting(settings, 'reservationCommissionValue', 'reservation_commission_value'),
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 3,
  });
}

export function buildDeliveryPlan(settings: MasterSettingsInput): OrderChannelFeePlan {
  return buildOrderChannelFeePlan({
    channel: 'delivery',
    enabled: pickSetting(settings, 'deliveryEnabled', 'delivery_enabled'),
    commissionType: pickSetting(settings, 'deliveryCommissionType', 'delivery_commission_type'),
    commissionValue: pickSetting(settings, 'deliveryCommissionValue', 'delivery_commission_value'),
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 5,
  });
}
