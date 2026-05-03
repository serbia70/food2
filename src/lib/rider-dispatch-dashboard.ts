import { isAwaitingCourierOrder } from './rider-dispatch-view.ts';
import { parseDispatchTimestamp } from './rider-dispatch-meta.ts';

export {
  filterRiderActiveOrders,
  filterRiderDashboardOrders,
} from './rider-dispatch-dashboard-orders.ts';

export function getReminderBadgeCopy(count: number | null | undefined): string {
  return `已提醒 ${Math.max(0, Number(count || 0))} 次`;
}

export function shouldEscalateUnclaimedOrder(
  order: {
    status?: string | null;
    riderBroadcastedAt?: string | null;
    riderLastRemindedAt?: string | null;
  },
  nowIso: string,
  remindAfterMinutes: number,
): boolean {
  if (!isAwaitingCourierOrder(order)) return false;

  const now = parseDispatchTimestamp(nowIso);
  const base = parseDispatchTimestamp(order.riderLastRemindedAt) || parseDispatchTimestamp(order.riderBroadcastedAt);
  return now > 0 && base > 0 && now - base >= remindAfterMinutes * 60_000;
}

export function buildReminderPayload(
  order: {
    riderRemindCount?: number | null;
  },
  nowIso: string,
) {
  const baseTs = Date.parse(nowIso);
  const safeNowIso = Number.isFinite(baseTs) ? new Date(baseTs).toISOString() : '';
  return {
    riderRemindCount: Math.max(0, Number(order.riderRemindCount || 0)) + 1,
    riderLastRemindedAt: safeNowIso,
  };
}

export function buildDispatchPublishPayload(minutes: number, nowIso: string) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  const baseTs = Date.parse(nowIso);
  const safeNowIso = Number.isFinite(baseTs) ? new Date(baseTs).toISOString() : new Date().toISOString();
  const readyAt = new Date(Date.parse(safeNowIso) + safeMinutes * 60_000).toISOString();

  return {
    status: 'awaiting_courier',
    pickupEtaMinutes: safeMinutes,
    pickupReadyAt: readyAt,
    riderBroadcastedAt: safeNowIso,
    riderRemindCount: 0,
    riderLastRemindedAt: '',
  };
}
