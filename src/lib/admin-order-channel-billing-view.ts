import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';

type BillingInput = Record<string, unknown>;

type BillingSourceInput = {
  billing?: BillingInput;
  shop?: BillingInput;
  settings?: BillingInput;
};

type BillingPlanDefaults = {
  enabled?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
};

export type AdminOrderChannelBillingDefaults = {
  reservationPlan?: BillingPlanDefaults;
  deliveryPlan?: BillingPlanDefaults;
};

export type AdminOrderChannelBillingView = {
  billingBalanceRsd: number;
  billingAlertLevel: string;
  walletCopy: string;
  walletHint: string;
  balanceReminderText: string;
  balanceReminderLevel: string;
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
};

type CandidateSource = 'new' | 'legacy';

type Candidate = {
  value: unknown;
  source: CandidateSource;
};

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return undefined;
}

function firstCandidate(...candidates: Candidate[]): Candidate | undefined {
  for (const candidate of candidates) {
    if (hasValue(candidate.value)) return candidate;
  }
  return undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toStringValue(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): BillingInput {
  return value && typeof value === 'object' ? (value as BillingInput) : {};
}

function resolveSources(input: BillingInput): Required<BillingSourceInput> {
  const billing = asRecord(input.billing);
  const shop = input.shop && typeof input.shop === 'object' ? asRecord(input.shop) : input;
  const settings = asRecord(input.settings);
  return { billing, shop, settings };
}

function currentValue(candidate?: Candidate): unknown {
  return candidate?.source === 'new' ? candidate.value : undefined;
}

function legacyValue(candidate?: Candidate): unknown {
  return candidate?.source === 'legacy' ? candidate.value : undefined;
}

function readCommissionMode(value: unknown): 'global' | 'override' | '' {
  const raw = toStringValue(value).toLowerCase();
  if (raw === 'global' || raw === 'override') return raw;
  return '';
}

function resolveCommissionMode(shop: BillingInput, settings: BillingInput): 'global' | 'override' {
  return readCommissionMode(shop.commissionMode ?? shop.commission_mode) || readCommissionMode(settings.commissionMode ?? settings.commission_mode) || 'override';
}

function resolveBillingPlanType(shop: BillingInput): 'subscription' | 'business' {
  const raw = toStringValue(shop.billingPlanType ?? shop.billing_plan_type ?? shop.shopTierOverride ?? shop.shop_tier_override).toLowerCase();
  return raw === 'business' ? 'business' : 'subscription';
}

function resolveBalanceReminderLevel(billing: BillingInput, billingBalanceRsd: number): string {
  const raw = toStringValue(billing.billing_alert_level ?? billing.alert_level).toLowerCase();
  if (raw) return raw;
  if (billingBalanceRsd < 0) return 'overdue';
  if (billingBalanceRsd < 1000) return 'warning';
  return 'normal';
}

function resolveBalanceReminderText(level: string, billingBalanceRsd: number): string {
  if (level === 'overdue') {
    return '余额不足，请尽快充值';
  }
  if (level === 'critical') {
    return '余额紧张，请立即充值';
  }
  if (level === 'warning') {
    return '余额偏低，建议尽快充值';
  }
  return '';
}

function buildReservationPlan(input: BillingInput, defaults?: AdminOrderChannelBillingDefaults): OrderChannelFeePlan {
  const { billing, shop, settings } = resolveSources(input);
  const defaultPlan = defaults?.reservationPlan || {};
  const commissionMode = resolveCommissionMode(shop, settings);
  const billingPlanType = resolveBillingPlanType(shop);

  const enabledCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationEnabled, source: 'new' },
        { value: shop.enableReservation, source: 'new' },
        { value: settings.reservationEnabled, source: 'new' },
        { value: settings.reservation_enabled, source: 'new' },
        { value: billing.reservationEnabled, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationEnabled, source: 'new' },
        { value: settings.reservation_enabled, source: 'new' },
        { value: shop.reservationEnabled, source: 'new' },
        { value: shop.enableReservation, source: 'new' },
        { value: billing.reservationEnabled, source: 'new' },
      );

  const typeCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationCommissionType, source: 'new' },
        { value: settings.reservationCommissionType, source: 'new' },
        { value: settings.reservation_commission_type, source: 'new' },
        { value: billing.reservationCommissionType, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationCommissionType, source: 'new' },
        { value: settings.reservation_commission_type, source: 'new' },
        { value: shop.reservationCommissionType, source: 'new' },
        { value: billing.reservationCommissionType, source: 'new' },
      );

  const valueCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.reservationCommissionValue, source: 'new' },
        { value: settings.reservationCommissionValue, source: 'new' },
        { value: settings.reservation_commission_value, source: 'new' },
        { value: billing.reservationCommissionValue, source: 'new' },
      )
    : firstCandidate(
        { value: settings.reservationCommissionValue, source: 'new' },
        { value: settings.reservation_commission_value, source: 'new' },
        { value: shop.reservationCommissionValue, source: 'new' },
        { value: billing.reservationCommissionValue, source: 'new' },
      );

  return buildOrderChannelFeePlan({
    channel: 'reservation',
    scope: 'shop',
    enabled: currentValue(enabledCandidate),
    commissionType: currentValue(typeCandidate),
    commissionValue: currentValue(valueCandidate),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 3,
  });
}

function buildDeliveryPlan(input: BillingInput, defaults?: AdminOrderChannelBillingDefaults): OrderChannelFeePlan {
  const { billing, shop, settings } = resolveSources(input);
  const defaultPlan = defaults?.deliveryPlan || {};
  const commissionMode = resolveCommissionMode(shop, settings);
  const billingPlanType = resolveBillingPlanType(shop);

  const enabledCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryEnabled, source: 'new' },
        { value: shop.enableDelivery, source: 'new' },
        { value: settings.deliveryEnabled, source: 'new' },
        { value: settings.delivery_enabled, source: 'new' },
        { value: billing.deliveryEnabled, source: 'new' },
      )
    : firstCandidate(
        { value: settings.deliveryEnabled, source: 'new' },
        { value: settings.delivery_enabled, source: 'new' },
        { value: shop.deliveryEnabled, source: 'new' },
        { value: shop.enableDelivery, source: 'new' },
        { value: billing.deliveryEnabled, source: 'new' },
      );

  const splitDeliveryType = billingPlanType === 'business'
    ? settings.business_delivery_commission_type
    : settings.subscription_delivery_commission_type;
  const splitDeliveryValue = billingPlanType === 'business'
    ? settings.business_delivery_commission_value
    : settings.subscription_delivery_commission_value;

  const typeCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryCommissionType, source: 'new' },
        { value: settings.deliveryCommissionType, source: 'new' },
        { value: settings.delivery_commission_type, source: 'new' },
        { value: splitDeliveryType, source: 'new' },
        { value: billing.deliveryCommissionType, source: 'new' },
      )
    : firstCandidate(
        { value: splitDeliveryType, source: 'new' },
        { value: settings.deliveryCommissionType, source: 'new' },
        { value: settings.delivery_commission_type, source: 'new' },
        { value: shop.deliveryCommissionType, source: 'new' },
        { value: billing.deliveryCommissionType, source: 'new' },
      );

  const valueCandidate = commissionMode === 'override'
    ? firstCandidate(
        { value: shop.deliveryCommissionValue, source: 'new' },
        { value: settings.deliveryCommissionValue, source: 'new' },
        { value: settings.delivery_commission_value, source: 'new' },
        { value: splitDeliveryValue, source: 'new' },
        { value: billing.deliveryCommissionValue, source: 'new' },
      )
    : firstCandidate(
        { value: splitDeliveryValue, source: 'new' },
        { value: settings.deliveryCommissionValue, source: 'new' },
        { value: settings.delivery_commission_value, source: 'new' },
        { value: shop.deliveryCommissionValue, source: 'new' },
        { value: billing.deliveryCommissionValue, source: 'new' },
      );

  return buildOrderChannelFeePlan({
    channel: 'delivery',
    scope: 'shop',
    enabled: currentValue(enabledCandidate),
    commissionType: currentValue(typeCandidate),
    commissionValue: currentValue(valueCandidate),
    defaultEnabled: defaultPlan.enabled ?? true,
    defaultCommissionType: defaultPlan.commissionType ?? 'percentage',
    defaultCommissionValue: defaultPlan.commissionValue ?? 5,
  });
}

export function buildAdminOrderChannelBillingView(
  input: BillingInput,
  defaults?: AdminOrderChannelBillingDefaults,
): AdminOrderChannelBillingView {
  const { billing } = resolveSources(input);
  const billingBalanceRsd = toNumber(firstValue(billing.balance_rsd, input.balance_rsd), 0);
  const balanceReminderLevel = resolveBalanceReminderLevel(billing, billingBalanceRsd);
  const reservationPlan = buildReservationPlan(input, defaults);
  const deliveryPlan = buildDeliveryPlan(input, defaults);

  return {
    billingBalanceRsd,
    billingAlertLevel: balanceReminderLevel,
    walletCopy: `预订 / 外卖余额：${billingBalanceRsd} RSD`,
    walletHint: '仅用于预订 / 外卖技术服务费，不包含堂食年费',
    balanceReminderText: resolveBalanceReminderText(balanceReminderLevel, billingBalanceRsd),
    balanceReminderLevel,
    reservationPlan,
    deliveryPlan,
  };
}
