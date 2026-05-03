import { pickFirstMeaningfulValue } from './master-value-selection.ts';
import {
  addDays,
  addMonths,
  dateOnlyToDayNumber,
  getNextDineInBillingStart,
  normalizeReferenceDate,
  toDateOnly,
} from './dine-in-billing-dates.ts';

type AlertLevel = 'normal' | 'warning' | 'overdue' | 'auto_closed' | 'stopped' | 'disabled_unknown';

type DineInBillingState = {
  billingStartAt: string;
  expiresAt: string;
  graceUntil: string;
  alertLevel: AlertLevel;
  statusLabel: string;
  rowTone: string;
};

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

export { getNextDineInBillingStart } from './dine-in-billing-dates.ts';

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
