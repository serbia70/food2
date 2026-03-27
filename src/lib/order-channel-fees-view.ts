import { hasMeaningfulValue } from './master-value-selection.ts';

export type OrderChannel = 'reservation' | 'delivery';
export type OrderChannelFeeType = 'percentage' | 'per_order';
export type OrderChannelFeeSource = 'new' | 'legacy' | 'default';

export type OrderChannelFeePlan = {
  channel: OrderChannel;
  enabled: boolean;
  commissionType: OrderChannelFeeType;
  commissionValue: number;
  displayText: string;
  isFree: boolean;
  source: OrderChannelFeeSource;
  sourceLabel: string;
};

export type OrderChannelFeePlanInput = {
  channel: OrderChannel;
  scope?: 'global' | 'shop';
  enabled?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
  defaultEnabled?: unknown;
  defaultCommissionType?: unknown;
  defaultCommissionValue?: unknown;
  legacyEnabled?: unknown;
  legacyCommissionType?: unknown;
  legacyCommissionValue?: unknown;
};

function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function toCommissionType(value: unknown, fallback: OrderChannelFeeType): OrderChannelFeeType {
  const raw = String(value ?? '').trim();
  if (raw === 'percentage' || raw === 'per_order') return raw;
  return fallback;
}

function sourceLabel(source: OrderChannelFeeSource): string {
  if (source === 'new' || source === 'legacy') return '店铺覆盖';
  return '全局默认';
}

export function formatOrderChannelFeeRule(type: unknown, value: unknown): string {
  const normalizedType = String(type ?? '').trim();
  const normalizedValue = toNumber(value, Number.NaN);

  if (!Number.isFinite(normalizedValue)) {
    return '未设置提成规则';
  }

  if (normalizedValue === 0) {
    return '免费';
  }

  if (normalizedType === 'percentage') {
    return `${normalizedValue}%`;
  }

  if (normalizedType === 'per_order') {
    return `每单 ${normalizedValue} RSD`;
  }

  return '未设置提成规则';
}

export function buildOrderChannelFeePlan(input: OrderChannelFeePlanInput): OrderChannelFeePlan {
  const hasNewInput = hasMeaningfulValue(input.enabled) || hasMeaningfulValue(input.commissionType) || hasMeaningfulValue(input.commissionValue);
  const hasLegacyInput = hasMeaningfulValue(input.legacyEnabled) || hasMeaningfulValue(input.legacyCommissionType) || hasMeaningfulValue(input.legacyCommissionValue);

  const enabledFallback = input.scope === 'global' ? false : true;
  const enabledValue = hasMeaningfulValue(input.enabled)
    ? input.enabled
    : hasMeaningfulValue(input.legacyEnabled)
      ? input.legacyEnabled
      : input.defaultEnabled;
  const typeValue = hasMeaningfulValue(input.commissionType)
    ? input.commissionType
    : hasMeaningfulValue(input.legacyCommissionType)
      ? input.legacyCommissionType
      : input.defaultCommissionType;
  const commissionValue = hasMeaningfulValue(input.commissionValue)
    ? input.commissionValue
    : hasMeaningfulValue(input.legacyCommissionValue)
      ? input.legacyCommissionValue
      : input.defaultCommissionValue;
  const enabled = toBoolean(enabledValue, enabledFallback);
  const commissionType = toCommissionType(typeValue, 'percentage');
  const commissionValueNumber = toNumber(commissionValue, input.scope === 'global' ? 0 : 3);
  const normalizedDefaultType = toCommissionType(input.defaultCommissionType, 'percentage');
  const normalizedDefaultValue = toNumber(input.defaultCommissionValue, input.scope === 'global' ? 0 : 3);
  const matchesDefault =
    commissionType === normalizedDefaultType &&
    commissionValueNumber === normalizedDefaultValue;
  const source: OrderChannelFeeSource = hasNewInput ? 'new' : hasLegacyInput && !matchesDefault ? 'legacy' : 'default';

  return {
    channel: input.channel,
    enabled,
    commissionType,
    commissionValue: commissionValueNumber,
    displayText: formatOrderChannelFeeRule(commissionType, commissionValueNumber),
    isFree: commissionValueNumber === 0,
    source,
    sourceLabel: sourceLabel(source),
  };
}
