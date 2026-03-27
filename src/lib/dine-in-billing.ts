import { pickFirstMeaningfulValue } from './master-value-selection.ts';

const BUSINESS_TIMEZONE = 'Europe/Belgrade';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

type AlertLevel = 'normal' | 'warning' | 'overdue' | 'auto_closed' | 'stopped' | 'disabled_unknown';

type DineInBillingState = {
  billingStartAt: string;
  expiresAt: string;
  graceUntil: string;
  alertLevel: AlertLevel;
  statusLabel: string;
  rowTone: string;
};

function toDateOnly(value: any): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (DATE_ONLY_RE.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return toBusinessDateKey(parsed);
}

function toBusinessDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function normalizeReferenceDate(referenceDate?: string | Date): string {
  if (referenceDate instanceof Date) {
    return toBusinessDateKey(referenceDate);
  }

  if (typeof referenceDate === 'string') {
    const raw = referenceDate.trim();
    if (DATE_ONLY_RE.test(raw)) return raw;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return toBusinessDateKey(parsed);
      }
    }
  }

  return toBusinessDateKey(new Date());
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  if (!DATE_ONLY_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function dateOnlyToDayNumber(value: string): number {
  const parsed = parseDateOnly(value);
  if (!parsed) return Number.NaN;
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / 86_400_000);
}

function addDays(dateOnly: string, days: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) return '';
  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const next = new Date(utcMs);
  const year = String(next.getUTCFullYear());
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(dateOnly: string, months: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) return '';
  const utcMs = Date.UTC(parsed.year, parsed.month - 1 + months, parsed.day);
  const next = new Date(utcMs);
  const year = String(next.getUTCFullYear());
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveLabel(alertLevel: AlertLevel): string {
  if (alertLevel === 'normal') return '正常';
  if (alertLevel === 'warning') return '即将到期';
  if (alertLevel === 'overdue') return '已逾期';
  if (alertLevel === 'auto_closed') return '已自动关闭';
  if (alertLevel === 'stopped') return '已停用';
  return '已关闭（原因未知）';
}

function resolveRowTone(alertLevel: AlertLevel): string {
  if (alertLevel === 'normal') return 'normal';
  if (alertLevel === 'warning') return 'warning';
  if (alertLevel === 'overdue') return 'danger';
  if (alertLevel === 'auto_closed') return 'muted';
  if (alertLevel === 'stopped') return 'muted';
  return 'muted';
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function isManualStop(shop: Record<string, any>): boolean {
  const reason = String(shop?.dine_in_stop_reason || '').trim().toLowerCase();
  return reason === 'manual';
}

function isDineInEnabled(shop: Record<string, any>): boolean {
  const value = pickFirstMeaningfulValue(shop?.enableDineIn, shop?.enable_dine_in);
  if (value === undefined) return true;
  return toBoolean(value, true);
}

export function getNextDineInBillingStart(referenceDate?: string | Date): string {
  const current = normalizeReferenceDate(referenceDate);
  const parsed = parseDateOnly(current);
  if (!parsed) return '';

  const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const month = parsed.month === 12 ? 1 : parsed.month + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}-01`;
}

export function buildDineInBillingState(shop: Record<string, any>, referenceDate?: string | Date): DineInBillingState {
  const currentDate = normalizeReferenceDate(referenceDate);

  const billingStartAt =
    toDateOnly(shop?.dine_in_billing_start_at) || getNextDineInBillingStart(currentDate);

  const expiresAt =
    toDateOnly(shop?.dine_in_expires_at) ||
    toDateOnly(shop?.expire_date) ||
    (billingStartAt ? addMonths(billingStartAt, 12) : '');
  const graceUntil = toDateOnly(shop?.dine_in_grace_until) || (expiresAt ? addDays(expiresAt, 5) : '');

  let alertLevel: AlertLevel = 'normal';

  if (!isDineInEnabled(shop) && isManualStop(shop)) {
    alertLevel = 'stopped';
  } else if (!isDineInEnabled(shop)) {
    const reason = String(shop?.dine_in_stop_reason || '').trim().toLowerCase();
    alertLevel = reason === 'auto_expired' ? 'auto_closed' : 'disabled_unknown';
  } else if (expiresAt) {
    const currentDay = dateOnlyToDayNumber(currentDate);
    const expiryDay = dateOnlyToDayNumber(expiresAt);
    const graceDay = dateOnlyToDayNumber(graceUntil);

    if (Number.isFinite(currentDay) && Number.isFinite(expiryDay) && Number.isFinite(graceDay)) {
      if (currentDay > graceDay) {
        alertLevel = 'auto_closed';
      } else if (currentDay >= expiryDay) {
        alertLevel = 'overdue';
      } else if (expiryDay - currentDay <= 5) {
        alertLevel = 'warning';
      }
    }
  }

  return {
    billingStartAt,
    expiresAt,
    graceUntil,
    alertLevel,
    statusLabel: resolveLabel(alertLevel),
    rowTone: resolveRowTone(alertLevel),
  };
}
