type BillingInput = Record<string, unknown>;

type BillingSourceInput = {
  billing?: BillingInput;
  shop?: BillingInput;
  settings?: BillingInput;
};

type CandidateSource = 'new' | 'legacy';

export type Candidate = {
  value: unknown;
  source: CandidateSource;
};

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

export function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return undefined;
}

export function firstCandidate(...candidates: Candidate[]): Candidate | undefined {
  for (const candidate of candidates) {
    if (hasValue(candidate.value)) return candidate;
  }
  return undefined;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function toStringValue(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): BillingInput {
  return value && typeof value === 'object' ? (value as BillingInput) : {};
}

export function resolveSources(input: BillingInput): Required<BillingSourceInput> {
  const billing = asRecord(input.billing);
  const shop = input.shop && typeof input.shop === 'object' ? asRecord(input.shop) : input;
  const settings = asRecord(input.settings);
  return { billing, shop, settings };
}

export function currentValue(candidate?: Candidate): unknown {
  return candidate?.source === 'new' ? candidate.value : undefined;
}

export function readCommissionMode(value: unknown): 'global' | 'override' | '' {
  const raw = toStringValue(value).toLowerCase();
  if (raw === 'global' || raw === 'override') return raw;
  return '';
}

export function resolveCommissionMode(shop: BillingInput, settings: BillingInput): 'global' | 'override' {
  return readCommissionMode(shop.commissionMode ?? shop.commission_mode) || readCommissionMode(settings.commissionMode ?? settings.commission_mode) || 'override';
}

export function resolveBillingPlanType(shop: BillingInput): 'subscription' | 'business' {
  const raw = toStringValue(shop.billingPlanType ?? shop.billing_plan_type ?? shop.shopTierOverride ?? shop.shop_tier_override).toLowerCase();
  return raw === 'business' ? 'business' : 'subscription';
}

export function resolveBalanceReminderLevel(billing: BillingInput, billingBalanceRsd: number): string {
  const raw = toStringValue(billing.billing_alert_level ?? billing.alert_level).toLowerCase();
  if (raw) return raw;
  if (billingBalanceRsd < 0) return 'overdue';
  if (billingBalanceRsd < 1000) return 'warning';
  return 'normal';
}

export function resolveBalanceReminderText(level: string, billingBalanceRsd: number): string {
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
