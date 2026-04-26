import { parseDispatchTimestamp } from './rider-dispatch-meta.ts';
import {
  isActiveAwaitingCourierOrder,
  isSameBelgradeDay,
  readOrderCourierPhoneForDashboard,
  readRiderOrderCompletedTimestampForDashboard,
} from './rider-dispatch-dashboard-time.ts';

export function filterRiderActiveOrders<T extends {
  status?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
  pickup_ready_at?: string | null;
  rider_broadcasted_at?: string | null;
  created_at?: string | null;
}>(
  orders: T[],
  riderPhone?: string | null,
  nowIso?: string,
): T[] {
  const phone = String(riderPhone || '').trim();
  return orders.filter((order) => {
    if (isActiveAwaitingCourierOrder(order, nowIso)) return true;
    const status = String(order?.status || '').trim();
    if (status !== 'delivering' && status !== 'picked_up') return false;
    if (!phone) return false;
    return readOrderCourierPhoneForDashboard(order) === phone;
  });
}

export function filterRiderDashboardOrders<T extends {
  status?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
  pickup_ready_at?: string | null;
  rider_broadcasted_at?: string | null;
  created_at?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
}>(
  orders: T[],
  riderPhone?: string | null,
  view: 'pool' | 'active' | 'history' | 'dashboard' = 'active',
  nowIso?: string,
): T[] {
  const phone = String(riderPhone || '').trim();
  const nowTs = parseDispatchTimestamp(nowIso || new Date().toISOString());

  const historyOrders = !phone
    ? []
    : orders.filter((order) => (
      String(order?.status || '').trim() === 'completed'
      && readOrderCourierPhoneForDashboard(order) === phone
      && isSameBelgradeDay(readRiderOrderCompletedTimestampForDashboard(order), nowTs)
    ));
  const activeOrders = filterRiderActiveOrders(orders, phone, nowIso);

  if (view === 'history') return historyOrders;
  if (view === 'pool') {
    return activeOrders.filter((order) => isActiveAwaitingCourierOrder(order, nowIso));
  }
  if (view === 'active') {
    return activeOrders.filter((order) => {
      const status = String(order?.status || '').trim();
      return status === 'delivering' || status === 'picked_up';
    });
  }

  return [
    ...activeOrders,
    ...historyOrders,
  ];
}
