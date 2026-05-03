import { parseDispatchTimestamp } from './rider-dispatch-meta.ts';
import { isRiderClaimableOrder } from './rider-dispatch-view.ts';

const STALE_AWAITING_ORDER_MS = 6 * 60 * 60 * 1000;

function readOrderCourierPhone(order: {
  courierPhone?: string | null;
  courier_phone?: string | null;
}): string {
  return String(order?.courierPhone || order?.courier_phone || '').trim();
}

function readOrderActiveTimestamp(order: {
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
  pickup_ready_at?: string | null;
  rider_broadcasted_at?: string | null;
  created_at?: string | null;
}): number {
  return parseDispatchTimestamp(
    String(
      order?.pickupReadyAt
      || order?.riderBroadcastedAt
      || order?.createdAt
      || order?.pickup_ready_at
      || order?.rider_broadcasted_at
      || order?.created_at
      || '',
    ),
  );
}

export function isActiveAwaitingCourierOrder(
  order: {
    status?: string | null;
    pickupReadyAt?: string | null;
    riderBroadcastedAt?: string | null;
    createdAt?: string | null;
    pickup_ready_at?: string | null;
    rider_broadcasted_at?: string | null;
    created_at?: string | null;
  },
  nowIso?: string,
): boolean {
  if (!isRiderClaimableOrder(order)) return false;
  const now = parseDispatchTimestamp(nowIso || new Date().toISOString());
  const orderTs = readOrderActiveTimestamp(order);
  if (now <= 0 || orderTs <= 0) return true;
  return now - orderTs <= STALE_AWAITING_ORDER_MS;
}

function readRiderOrderCompletedTimestamp(order: {
  completedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): number {
  return parseDispatchTimestamp(
    String(
      order?.completedAt
      || order?.updatedAt
      || order?.createdAt
      || order?.completed_at
      || order?.updated_at
      || order?.created_at
      || '',
    ),
  );
}

let belgradeDayFormatter: Intl.DateTimeFormat | null | undefined;

function readBelgradeDayFormatter(): Intl.DateTimeFormat | null {
  if (belgradeDayFormatter !== undefined) return belgradeDayFormatter;
  try {
    belgradeDayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    belgradeDayFormatter = null;
  }
  return belgradeDayFormatter;
}

function readBelgradeDayKey(timestamp: number): string {
  if (timestamp <= 0) return '';
  const formatter = readBelgradeDayFormatter();
  if (!formatter) return '';
  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : '';
}

export function isSameBelgradeDay(leftTs: number, rightTs: number): boolean {
  const leftDayKey = readBelgradeDayKey(leftTs);
  const rightDayKey = readBelgradeDayKey(rightTs);
  return leftDayKey !== '' && leftDayKey === rightDayKey;
}

export function readOrderCourierPhoneForDashboard(order: {
  courierPhone?: string | null;
  courier_phone?: string | null;
}): string {
  return readOrderCourierPhone(order);
}

export function readRiderOrderCompletedTimestampForDashboard(order: {
  completedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): number {
  return readRiderOrderCompletedTimestamp(order);
}
