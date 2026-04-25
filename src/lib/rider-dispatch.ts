import type { Rider } from '../types/index.ts';

export interface DispatchDecisionMeta {
  action: 'accepted' | 'declined';
  riderId: string;
  riderName: string;
  riderPhone: string;
  at: string;
}

export interface DispatchTelegramMessageRef {
  chatId: string;
  messageId: number;
}

export interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  lastInvalidationReason: 'declined' | 'timeout' | 'reassigned' | null;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: DispatchTelegramMessageRef | null;
}

export type RiderOrderAction = 'accept' | 'decline' | 'picked_up' | 'complete';

export interface ResolveRiderOrderActionResult {
  allowed: boolean;
  error: '' | 'dispatch_invalidated' | 'order_status_updated' | 'order_completed';
  reason: string;
  expectedCurrentStatus: string;
  targetStatus: string;
  nextRemarksJson: string;
  feedbackWriteMode: 'none' | 'admin_remarks' | 'update_status_remarks';
  excludedRiderIds: string[];
}

const DISPATCH_META_PREFIX = 'dispatch_meta:';

function createEmptyDispatchMeta(): DispatchMeta {
  return {
    lastRiderDecision: null,
    declinedRiderIds: [],
    currentRiderId: '',
    currentAssignedAt: '',
    currentExpiresAt: '',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '',
    pickedUpAt: '',
    completedAt: '',
    telegramMessageRef: null,
  };
}

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
    case 'picked_up':
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

function sanitizeMapQueryAddress(value: string | null | undefined): string {
  const trimmed = String(value || '')
    .trim()
    .replace(/\s*\[货到付款\/Cash\].*$/u, '')
    .replace(/\s*\(备注:.*$/u, '')
    .trim();
  if (!trimmed) return '';

  const parts = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const maybePhone = parts[1]?.replace(/\s+/g, '') || '';
    if (/^\+?\d[\d-]{5,}$/.test(maybePhone)) {
      return parts.slice(2).join(', ').trim();
    }
  }

  return trimmed;
}

export function buildRiderOrderMapUrl(rawUrl: string | null | undefined, fallbackAddress: string | null | undefined): string {
  const direct = String(rawUrl || '').trim();
  if (direct) return direct;
  const address = sanitizeMapQueryAddress(fallbackAddress);
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

export function buildRiderOrderView(order: {
  status?: string | null;
  shopName?: string | null;
  restaurantName?: string | null;
  shopAddress?: string | null;
  restaurantAddress?: string | null;
  shopMapUrl?: string | null;
  deliveryMapUrl?: string | null;
  tableInfo?: string | null;
  deliveryAddress?: string | null;
  courierName?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
  totalAmount?: number | string | null;
  pickupEtaMinutes?: number | string | null;
}) {
  const status = String(order?.status || '').trim();
  const shopName = String(order?.shopName || order?.restaurantName || '店铺').trim();
  const shopAddress = String(order?.shopAddress || order?.restaurantAddress || '').trim();
  const deliveryAddress = String(order?.tableInfo || order?.deliveryAddress || '').trim();

  return {
    shopName,
    shopAddress,
    shopMapUrl: buildRiderOrderMapUrl(order?.shopMapUrl, shopAddress),
    deliveryAddress,
    deliveryMapUrl: buildRiderOrderMapUrl(order?.deliveryMapUrl, deliveryAddress),
    orderStatusCopy: getAdminDispatchStatusCopy(status === 'picked_up' ? 'delivering' : status),
    courierName: String(order?.courierName || '').trim(),
    courierPhone: String(order?.courierPhone || order?.courier_phone || '').trim(),
    totalAmount: Number(order?.totalAmount || 0) || 0,
    pickupEtaMinutes: Number(order?.pickupEtaMinutes || 0) || 0,
  };
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

function readOrderCourierPhone(order: {
  courierPhone?: string | null;
  courier_phone?: string | null;
}): string {
  return String(order?.courierPhone || order?.courier_phone || '').trim();
}

function readOrderRemarksJson(order: {
  remarksJson?: string | null;
  remarks_json?: string | null;
}): string {
  return String(order?.remarksJson || order?.remarks_json || '').trim();
}

export function getRiderActionFlags(
  order: {
    status?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  },
  riderPhone?: string | null,
) {
  const status = String(order?.status || '').trim();
  const phone = String(riderPhone || '').trim();
  const orderPhone = readOrderCourierPhone(order);
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

export function buildContactableRiderRows<
  T extends Pick<Rider, 'id' | 'name' | 'phone' | 'status'> & { telegramChatId?: string | null; telegram_chat_id?: string | null },
>(riders: T[]): T[] {
  return pickAvailableRiders(riders).map((rider) => {
    const telegramChatId = String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
    return telegramChatId && !String(rider.telegramChatId || '').trim()
      ? { ...rider, telegramChatId }
      : rider;
  });
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
      const acceptedAt = String(parsed.acceptedAt || '').trim();
      const pickedUpAt = String(parsed.pickedUpAt || '').trim();
      const completedAt = String(parsed.completedAt || '').trim();
      const rawTelegramMessageRef = parsed.telegramMessageRef && typeof parsed.telegramMessageRef === 'object'
        ? parsed.telegramMessageRef
        : null;
      const telegramChatId = String(rawTelegramMessageRef?.chatId || '').trim();
      const telegramMessageId = Number(rawTelegramMessageRef?.messageId || 0);
      const telegramMessageRef = telegramChatId && telegramMessageId > 0
        ? {
            chatId: telegramChatId,
            messageId: telegramMessageId,
          }
        : null;

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
        acceptedAt: parseTimestamp(acceptedAt) > 0 ? acceptedAt : '',
        pickedUpAt: parseTimestamp(pickedUpAt) > 0 ? pickedUpAt : '',
        completedAt: parseTimestamp(completedAt) > 0 ? completedAt : '',
        telegramMessageRef,
      };
    } catch {
      continue;
    }
  }

  return createEmptyDispatchMeta();
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

function hasDispatchMetaConstraints(_remarksJson: string, meta: DispatchMeta): boolean {
  return !!(
    meta.lastRiderDecision
    || meta.declinedRiderIds.length > 0
    || meta.currentRiderId
    || meta.currentAssignedAt
    || meta.currentExpiresAt
    || meta.invalidatedRiderIds.length > 0
    || meta.lastInvalidationReason
  );
}

export function getRiderDispatchState(
  order: {
    status?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  },
  meta: DispatchMeta,
  riderId?: string | null,
  nowIso?: string,
  riderPhone?: string | null,
): {
  canAccept: boolean;
  canDecline: boolean;
  canComplete: boolean;
  invalidReason: string;
} {
  const status = String(order?.status || '').trim();
  const currentRiderId = String(meta.currentRiderId || '').trim();
  const currentId = String(riderId || '').trim();
  const currentPhone = String(riderPhone || '').trim();
  const orderPhone = readOrderCourierPhone(order);
  const ownsDeliveryWithoutDispatchMeta = !currentRiderId && !!currentPhone && currentPhone === orderPhone;

  if (isRiderDeliveringOrder(status)) {
    return {
      canAccept: false,
      canDecline: false,
      canComplete: (!!currentId && currentId === currentRiderId) || ownsDeliveryWithoutDispatchMeta,
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

export function resolveRiderUnifiedStatus(input: {
  status?: string | null;
  remarksJson?: string | null;
  remarks_json?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
}, rider: {
  riderId?: string | null;
  riderPhone?: string | null;
  nowIso?: string;
}): {
  statusLabel: string;
  primaryAction: string;
  secondaryAction: string;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
} {
  const status = String(input.status || '').trim();
  const remarksJson = readOrderRemarksJson(input);
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const effectiveStatus = meta.completedAt
    ? 'completed'
    : (status === 'picked_up' || (status === 'delivering' && !!meta.pickedUpAt))
      ? 'picked_up'
      : status;
  const state = resolveRiderDashboardActionState({
    order: {
      status: effectiveStatus,
      remarksJson,
      courierPhone: readOrderCourierPhone(input),
    },
    riderId: rider.riderId,
    riderPhone: rider.riderPhone,
    nowIso: rider.nowIso,
  });

  if (effectiveStatus === 'awaiting_courier') {
    return {
      statusLabel: '待接单',
      primaryAction: state.canAccept ? '接单' : '',
      secondaryAction: state.canDecline ? '暂不接单' : '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (effectiveStatus === 'delivering') {
    return {
      statusLabel: '待取餐',
      primaryAction: state.canPickUp ? '取餐' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (effectiveStatus === 'picked_up') {
    return {
      statusLabel: '配送中',
      primaryAction: state.canComplete ? '送达' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  return {
    statusLabel: '已送达',
    primaryAction: '',
    secondaryAction: '',
    acceptedAt: meta.acceptedAt,
    pickedUpAt: meta.pickedUpAt,
    completedAt: meta.completedAt,
  };
}

export function resolveRiderDashboardActionState(input: {
  order: {
    status?: string | null;
    remarksJson?: string | null;
    remarks_json?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  };
  riderId?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  nowIso?: string;
}): {
  canAccept: boolean;
  canDecline: boolean;
  canPickUp: boolean;
  canComplete: boolean;
  invalidReason: string;
} {
  const order = {
    status: String(input.order?.status || '').trim(),
    remarksJson: readOrderRemarksJson(input.order),
    courierPhone: readOrderCourierPhone(input.order),
  };
  const riderId = String(input.riderId || '').trim();
  const riderName = String(input.riderName || '').trim();
  const riderPhone = String(input.riderPhone || '').trim();
  const nowIso = String(input.nowIso || new Date().toISOString()).trim();

  const accept = resolveRiderOrderAction({
    action: 'accept',
    order,
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });
  const decline = resolveRiderOrderAction({
    action: 'decline',
    order,
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });
  const pickedUp = resolveRiderOrderAction({
    action: 'picked_up',
    order,
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });
  const complete = resolveRiderOrderAction({
    action: 'complete',
    order,
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });

  let invalidReason = '';
  if (order.status === 'awaiting_courier') {
    invalidReason = accept.allowed || decline.allowed ? '' : (accept.reason || decline.reason || '');
  } else if (order.status === 'delivering') {
    invalidReason = pickedUp.allowed ? '' : (pickedUp.reason || '');
  } else if (order.status === 'picked_up') {
    invalidReason = complete.allowed ? '' : (complete.reason || '');
  }

  return {
    canAccept: accept.allowed,
    canDecline: decline.allowed,
    canPickUp: pickedUp.allowed,
    canComplete: complete.allowed,
    invalidReason,
  };
}

export function resolveRiderOrderAction(input: {
  action: RiderOrderAction;
  order: {
    status?: string | null;
    remarksJson?: string | null;
    remarks_json?: string | null;
    courierPhone?: string | null;
    courier_phone?: string | null;
  };
  riderId?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  nowIso?: string;
}): ResolveRiderOrderActionResult {
  const action = input.action;
  const remarksJson = readOrderRemarksJson(input.order);
  const status = String(input.order?.status || '').trim();
  const riderId = String(input.riderId || '').trim();
  const riderName = String(input.riderName || '').trim();
  const riderPhone = String(input.riderPhone || '').trim();
  const courierPhone = readOrderCourierPhone(input.order);
  const nowIso = String(input.nowIso || new Date().toISOString()).trim();
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const dispatchState = getRiderDispatchState(
    {
      status,
      courierPhone: courierPhone || riderPhone,
    },
    meta,
    riderId,
    nowIso,
    riderPhone,
  );
  const enforceDispatchConstraints = hasDispatchMetaConstraints(remarksJson, meta);
  const deliveryProgressAllowedWithoutDispatchMeta = (action === 'picked_up' || action === 'complete')
    && !enforceDispatchConstraints
    && !!courierPhone
    && courierPhone === riderPhone;

  if (action === 'picked_up' || action === 'complete') {
    if (status === 'completed') {
      return {
        allowed: false,
        error: 'order_completed',
        reason: '',
        expectedCurrentStatus: action === 'picked_up' ? 'delivering' : 'picked_up',
        targetStatus: action === 'picked_up' ? 'picked_up' : 'completed',
        nextRemarksJson: '',
        feedbackWriteMode: 'none',
        excludedRiderIds: [],
      };
    }

    const expectedCurrentStatus = action === 'picked_up' ? 'delivering' : 'picked_up';
    const targetStatus = action === 'picked_up' ? 'picked_up' : 'completed';
    if (status && status !== expectedCurrentStatus) {
      return {
        allowed: false,
        error: 'order_status_updated',
        reason: '',
        expectedCurrentStatus,
        targetStatus,
        nextRemarksJson: '',
        feedbackWriteMode: 'none',
        excludedRiderIds: [],
      };
    }

    if (dispatchState.invalidReason) {
      return {
        allowed: false,
        error: 'dispatch_invalidated',
        reason: dispatchState.invalidReason,
        expectedCurrentStatus,
        targetStatus,
        nextRemarksJson: '',
        feedbackWriteMode: 'none',
        excludedRiderIds: [],
      };
    }

    if (!deliveryProgressAllowedWithoutDispatchMeta && !dispatchState.canComplete) {
      return {
        allowed: false,
        error: 'dispatch_invalidated',
        reason: '已改派',
        expectedCurrentStatus,
        targetStatus,
        nextRemarksJson: '',
        feedbackWriteMode: 'none',
        excludedRiderIds: [],
      };
    }

    return {
      allowed: true,
      error: '',
      reason: '',
      expectedCurrentStatus,
      targetStatus,
      nextRemarksJson: '',
      feedbackWriteMode: 'none',
      excludedRiderIds: [],
    };
  }

  if (status !== 'awaiting_courier') {
    return {
      allowed: false,
      error: status === 'completed' ? 'order_completed' : 'order_status_updated',
      reason: '',
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
      nextRemarksJson: '',
      feedbackWriteMode: 'none',
      excludedRiderIds: [],
    };
  }

  if (dispatchState.invalidReason) {
    return {
      allowed: false,
      error: 'dispatch_invalidated',
      reason: dispatchState.invalidReason,
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
      nextRemarksJson: '',
      feedbackWriteMode: 'none',
      excludedRiderIds: [],
    };
  }

  const actionAllowed = action === 'decline' ? dispatchState.canDecline : dispatchState.canAccept;
  if ((action === 'decline' || enforceDispatchConstraints) && !actionAllowed) {
    return {
      allowed: false,
      error: 'dispatch_invalidated',
      reason: '已改派',
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
      nextRemarksJson: '',
      feedbackWriteMode: 'none',
      excludedRiderIds: [],
    };
  }

  if (action === 'decline') {
    const declinedRiderIds = Array.from(new Set([
      ...meta.declinedRiderIds,
      riderId,
    ].filter(Boolean)));
    const invalidatedRiderIds = Array.from(new Set([
      ...meta.invalidatedRiderIds,
      riderId,
    ].filter(Boolean)));

    return {
      allowed: true,
      error: '',
      reason: '',
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: 'awaiting_courier',
      nextRemarksJson: JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
        lastRiderDecision: {
          action: 'declined',
          riderId,
          riderName,
          riderPhone,
          at: nowIso,
        },
        declinedRiderIds,
        currentRiderId: '',
        currentAssignedAt: '',
        currentExpiresAt: '',
        invalidatedRiderIds,
        lastInvalidationReason: 'declined',
        acceptedAt: meta.acceptedAt,
        pickedUpAt: meta.pickedUpAt,
        completedAt: meta.completedAt,
        telegramMessageRef: meta.telegramMessageRef,
      })),
      feedbackWriteMode: 'update_status_remarks',
      excludedRiderIds: Array.from(new Set([...declinedRiderIds, ...invalidatedRiderIds])),
    };
  }

  return {
    allowed: true,
    error: '',
    reason: '',
    expectedCurrentStatus: 'awaiting_courier',
    targetStatus: 'delivering',
    nextRemarksJson: JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
      lastRiderDecision: {
        action: 'accepted',
        riderId,
        riderName,
        riderPhone,
        at: nowIso,
      },
      declinedRiderIds: [],
      currentRiderId: riderId,
      currentAssignedAt: meta.currentAssignedAt,
      currentExpiresAt: meta.currentExpiresAt,
      invalidatedRiderIds: meta.invalidatedRiderIds,
      lastInvalidationReason: meta.lastInvalidationReason,
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
      telegramMessageRef: meta.telegramMessageRef,
    })),
    feedbackWriteMode: 'admin_remarks',
    excludedRiderIds: [],
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
  pickup_ready_at?: string | null;
  rider_broadcasted_at?: string | null;
  created_at?: string | null;
}): number {
  return parseTimestamp(
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

function isActiveAwaitingCourierOrder(
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
  const now = parseTimestamp(nowIso || new Date().toISOString());
  const orderTs = readOrderActiveTimestamp(order);
  if (now <= 0 || orderTs <= 0) return true;
  return now - orderTs <= STALE_AWAITING_ORDER_MS;
}

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
    return readOrderCourierPhone(order) === phone;
  });
}

function readRiderOrderCompletedTimestamp(order: {
  completedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): number {
  return parseTimestamp(
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

function isSameBelgradeDay(leftTs: number, rightTs: number): boolean {
  const leftDayKey = readBelgradeDayKey(leftTs);
  const rightDayKey = readBelgradeDayKey(rightTs);
  return leftDayKey !== '' && leftDayKey === rightDayKey;
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
  const nowTs = parseTimestamp(nowIso || new Date().toISOString());

  const historyOrders = !phone
    ? []
    : orders.filter((order) => (
      String(order?.status || '').trim() === 'completed'
      && readOrderCourierPhone(order) === phone
      && isSameBelgradeDay(readRiderOrderCompletedTimestamp(order), nowTs)
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
