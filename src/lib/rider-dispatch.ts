import type { Rider } from '../types/index.ts';

export function formatPickupEtaLabel(minutes: number | null | undefined): string {
  const value = Number(minutes || 0);
  return value > 0 ? `约 ${value} 分钟后可取` : '';
}

export function isAwaitingCourierOrder(order: { status?: string | null }): boolean {
  return String(order?.status || '') === 'awaiting_courier';
}

export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
      return '配送中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    case 'confirmed':
      return '已接单';
    default:
      return '待处理';
  }
}

export function isRiderClaimableOrder(order: {
  status?: string | null;
  courier_phone?: string | null;
  courierPhone?: string | null;
}): boolean {
  return isAwaitingCourierOrder(order);
}

export function pickAvailableRiders<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return riders.filter((rider) => rider.status === 'available' && String(rider.phone || '').trim() !== '');
}

export function buildContactableRiderRows<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return pickAvailableRiders(riders);
}

export function filterRiderActiveOrders<T extends { status?: string | null; courier_phone?: string | null; courierPhone?: string | null }>(
  orders: T[],
  riderPhone?: string | null,
): T[] {
  const phone = String(riderPhone || '').trim();
  return orders.filter((order) => {
    if (isRiderClaimableOrder(order)) return true;
    if (String(order?.status || '') !== 'delivering') return false;
    if (!phone) return false;
    return String(order?.courierPhone || order?.courier_phone || '').trim() === phone;
  });
}

export function filterRiderDashboardOrders<T extends { status?: string | null; courier_phone?: string | null; courierPhone?: string | null }>(
  orders: T[],
  riderPhone?: string | null,
  view: 'active' | 'history' = 'active',
): T[] {
  if (view === 'history') {
    const phone = String(riderPhone || '').trim();
    if (!phone) return [];
    return orders.filter(
      (order) => String(order?.status || '') === 'completed' && String(order?.courierPhone || order?.courier_phone || '').trim() === phone,
    );
  }
  return filterRiderActiveOrders(orders, riderPhone);
}

export function getRiderStatusHintCopy(status: string | null | undefined): string {
  switch (status) {
    case 'available':
      return '当前会进入派单名单并显示可抢订单';
    case 'busy':
      return '当前不会收到新派单，但可继续处理已接订单';
    default:
      return '当前不会进入派单名单';
  }
}

function parseTimestamp(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

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

  const now = parseTimestamp(nowIso);
  const base = parseTimestamp(order.riderLastRemindedAt) || parseTimestamp(order.riderBroadcastedAt);
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
