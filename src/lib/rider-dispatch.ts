import type { Rider } from '../types/index.ts';

export interface DispatchDecisionMeta {
  action: 'accepted' | 'declined';
  riderId: string;
  riderName: string;
  riderPhone: string;
  at: string;
}

export interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  lastInvalidationReason: 'declined' | 'timeout' | 'reassigned' | null;
}

const DISPATCH_META_PREFIX = 'dispatch_meta:';

const EMPTY_DISPATCH_META: DispatchMeta = {
  lastRiderDecision: null,
  declinedRiderIds: [],
  currentRiderId: '',
  currentAssignedAt: '',
  currentExpiresAt: '',
  invalidatedRiderIds: [],
  lastInvalidationReason: null,
};

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
      return '骑手已接单';
    case 'picked_up':
      return '骑手已取餐';
    case 'completed':
      return '已送达';
    case 'cancelled':
      return '已取消';
    case 'confirmed':
      return '已接单';
    default:
      return '待处理';
  }
}

export function getCustomerOrderStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'pending':
      return '等待接单';
    case 'confirmed':
      return '商家已接单';
    case 'awaiting_courier':
      return '待骑手接单';
    case 'cancelled':
    case 'closed':
      return '订单已关闭';
    default:
      return '';
  }
}

export function getCustomerDeliveryStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'delivering':
      return '送餐中';
    case 'picked_up':
      return '骑手已取餐，正在送达';
    case 'completed':
      return '已送达';
    default:
      return '';
  }
}

export const CUSTOMER_ACTIVE_STATUSES = ['pending', 'confirmed', 'awaiting_courier', 'delivering', 'picked_up'] as const;
export const CUSTOMER_DELIVERY_STATUSES = ['delivering', 'picked_up', 'completed'] as const;
export const CUSTOMER_COMPLETED_STATUSES = ['completed'] as const;
export const ADMIN_ACTIVE_DELIVERY_STATUSES = ['pending', 'confirmed', 'awaiting_courier', 'delivering', 'picked_up'] as const;

export function isCustomerActiveStatus(status: string | null | undefined): boolean {
  return CUSTOMER_ACTIVE_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_ACTIVE_STATUSES)[number]);
}

export function isCustomerDeliveryStatus(status: string | null | undefined): boolean {
  return CUSTOMER_DELIVERY_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_DELIVERY_STATUSES)[number]);
}

export function isCustomerCompletedStatus(status: string | null | undefined): boolean {
  return CUSTOMER_COMPLETED_STATUSES.includes(String(status || '').trim() as (typeof CUSTOMER_COMPLETED_STATUSES)[number]);
}

export function isCustomerDeliveryCompleteStatus(status: string | null | undefined): boolean {
  return isCustomerDeliveryStatus(status);
}

export function isAdminActiveDeliveryStatus(status: string | null | undefined): boolean {
  return ADMIN_ACTIVE_DELIVERY_STATUSES.includes(String(status || '').trim() as (typeof ADMIN_ACTIVE_DELIVERY_STATUSES)[number]);
}

export function getAdminDeliveryActionFlags(status: string | null | undefined) {
  const value = String(status || '').trim();
  return {
    canAssign: value === 'pending' || value === 'confirmed' || value === 'awaiting_courier',
    canMarkPickedUp: value === 'delivering',
    canMarkDelivered: value === 'picked_up',
    canEdit: value === 'pending' || value === 'confirmed' || value === 'delivering',
    showAssignedRider: value === 'delivering' || value === 'picked_up',
  };
}

export function isRiderDeliveringOrder(status: string | null | undefined): boolean {
  const value = String(status || '').trim();
  return value === 'delivering' || value === 'picked_up';
}

export function getDeliveryStatusTone(status: string | null | undefined): 'default' | 'info' | 'success' | 'danger' {
  switch (String(status || '')) {
    case 'declined':
      return 'danger';
    case 'delivering':
      return 'info';
    case 'picked_up':
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
}

export function isRiderClaimableOrder(order: {
  status?: string | null;
  courierPhone?: string | null;
}): boolean {
  return isAwaitingCourierOrder(order);
}

export function getRiderActionFlags(
  order: {
    status?: string | null;
    courierPhone?: string | null;
  },
  riderPhone?: string | null,
) {
  const status = String(order?.status || '').trim();
  const phone = String(riderPhone || '').trim();
  const orderPhone = String(order?.courierPhone || '').trim();
  const isCurrentRider = !!phone && phone === orderPhone;

  return {
    canAccept: status === 'awaiting_courier',
    canDecline: status === 'awaiting_courier',
    canPickUp: status === 'delivering' && isCurrentRider,
    canComplete: status === 'picked_up' && isCurrentRider,
  };
}

export function pickAvailableRiders<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return riders.filter((rider) => rider.status === 'available' && String(rider.phone || '').trim() !== '');
}

export function buildContactableRiderRows<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(riders: T[]): T[] {
  return pickAvailableRiders(riders);
}

export function readDispatchMetaFromRemarks(remarksJson: string | null | undefined): DispatchMeta {
  let remarks: unknown[] = [];
  try {
    const parsed = JSON.parse(String(remarksJson || '')) as unknown;
    remarks = Array.isArray(parsed) ? parsed : [];
  } catch {
    remarks = [];
  }

  for (let index = remarks.length - 1; index >= 0; index -= 1) {
    const value = String(remarks[index] || '').trim();
    if (!value.startsWith(DISPATCH_META_PREFIX)) continue;
    try {
      const parsed = JSON.parse(value.slice(DISPATCH_META_PREFIX.length)) as Partial<DispatchMeta>;
      const last = parsed.lastRiderDecision && typeof parsed.lastRiderDecision === 'object'
        ? {
            action: parsed.lastRiderDecision.action === 'accepted' ? 'accepted' : 'declined',
            riderId: String(parsed.lastRiderDecision.riderId || '').trim(),
            riderName: String(parsed.lastRiderDecision.riderName || '').trim(),
            riderPhone: String(parsed.lastRiderDecision.riderPhone || '').trim(),
            at: String(parsed.lastRiderDecision.at || '').trim(),
          }
        : null;

      const lastInvalidationReason = parsed.lastInvalidationReason === 'declined'
        || parsed.lastInvalidationReason === 'timeout'
        || parsed.lastInvalidationReason === 'reassigned'
        ? parsed.lastInvalidationReason
        : null;

      const currentAssignedAt = String(parsed.currentAssignedAt || '').trim();
      const currentExpiresAt = String(parsed.currentExpiresAt || '').trim();

      return {
        lastRiderDecision: last && last.riderId && last.riderName && last.riderPhone && last.at ? last : null,
        declinedRiderIds: Array.isArray(parsed.declinedRiderIds)
          ? parsed.declinedRiderIds.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        currentRiderId: String(parsed.currentRiderId || '').trim(),
        currentAssignedAt: parseTimestamp(currentAssignedAt) > 0 ? currentAssignedAt : '',
        currentExpiresAt: parseTimestamp(currentExpiresAt) > 0 ? currentExpiresAt : '',
        invalidatedRiderIds: Array.isArray(parsed.invalidatedRiderIds)
          ? parsed.invalidatedRiderIds.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        lastInvalidationReason,
      };
    } catch {
      continue;
    }
  }

  return { ...EMPTY_DISPATCH_META };
}

export function buildDispatchMetaRemarks(
  remarksJson: string | null | undefined,
  meta: DispatchMeta,
): string[] {
  let remarks: string[] = [];
  try {
    const parsed = JSON.parse(String(remarksJson || '')) as unknown;
    remarks = Array.isArray(parsed) ? parsed.map((item) => String(item || '')).filter(Boolean) : [];
  } catch {
    remarks = [];
  }

  const filtered = remarks.filter((item) => !String(item || '').trim().startsWith(DISPATCH_META_PREFIX));
  filtered.push(`${DISPATCH_META_PREFIX}${JSON.stringify(meta)}`);
  return filtered;
}

export function getRiderDispatchState(
  order: {
    status?: string | null;
    courierPhone?: string | null;
  },
  meta: DispatchMeta,
  riderId?: string | null,
  nowIso?: string,
): {
  canAccept: boolean;
  canDecline: boolean;
  canComplete: boolean;
  invalidReason: string;
} {
  const status = String(order?.status || '').trim();
  const currentRiderId = String(meta.currentRiderId || '').trim();
  const currentId = String(riderId || '').trim();

  if (isRiderDeliveringOrder(status)) {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: !!currentId && currentId === currentRiderId,
      invalidReason: '',
    };
  }

  if (status !== 'awaiting_courier') {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: false,
      invalidReason: '',
    };
  }

  if (meta.invalidatedRiderIds.includes(currentId)) {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: false,
      invalidReason: '已改派',
    };
  }

  const now = parseTimestamp(nowIso || new Date().toISOString());
  const expiresAt = parseTimestamp(meta.currentExpiresAt);
  const isCurrentRider = !!currentId && currentId === currentRiderId;

  if (isCurrentRider && now > 0 && expiresAt > 0 && now > expiresAt) {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: false,
      invalidReason: '接单超时',
    };
  }

  if (isCurrentRider && now > 0 && expiresAt > 0 && now <= expiresAt) {
    return {
      canAccept: true,
      canDecline: true,
      canComplete: false,
      invalidReason: '',
    };
  }

  if (currentRiderId && currentId && currentId !== currentRiderId) {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: false,
      invalidReason: '已改派',
    };
  }

  return {
    canAccept: false,
    canDecline: false,
    canComplete: false,
    invalidReason: '',
  };
}

export function filterAvailableRidersForOrder<T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'>>(
  riders: T[],
  remarksJson: string | null | undefined,
): T[] {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const declined = new Set(meta.declinedRiderIds);
  const invalidated = new Set(meta.invalidatedRiderIds);
  return buildContactableRiderRows(riders).filter((rider) => {
    const riderId = String(rider.id || '').trim();
    return !declined.has(riderId) && !invalidated.has(riderId);
  });
}

const STALE_AWAITING_ORDER_MS = 6 * 60 * 60 * 1000;

function readOrderActiveTimestamp(order: {
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
}): number {
  return parseTimestamp(
    String(
      order?.pickupReadyAt
      || order?.riderBroadcastedAt
      || order?.createdAt
      || '',
    ),
  );
}

function isActiveAwaitingCourierOrder(
  order: {
    status?: string | null;
    pickupReadyAt?: string | null;
    riderBroadcastedAt?: string | null;
    createdAt?: string | null;
  },
  nowIso?: string,
): boolean {
  if (!isRiderClaimableOrder(order)) return false;
  const now = parseTimestamp(nowIso || new Date().toISOString());
  const orderTs = readOrderActiveTimestamp(order);
  if (now <= 0 || orderTs <= 0) return true;
  return now - orderTs <= STALE_AWAITING_ORDER_MS;
}

export function filterRiderActiveOrders<T extends {
  status?: string | null;
  courierPhone?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
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
    return String(order?.courierPhone || '').trim() === phone;
  });
}

export function filterRiderDashboardOrders<T extends {
  status?: string | null;
  courierPhone?: string | null;
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
}>(
  orders: T[],
  riderPhone?: string | null,
  view: 'active' | 'history' = 'active',
  nowIso?: string,
): T[] {
  if (view === 'history') {
    const phone = String(riderPhone || '').trim();
    if (!phone) return [];
    return orders.filter(
      (order) => String(order?.status || '') === 'completed' && String(order?.courierPhone || '').trim() === phone,
    );
  }
  return filterRiderActiveOrders(orders, riderPhone, nowIso);
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
