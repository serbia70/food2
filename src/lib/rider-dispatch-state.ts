import {
  parseDispatchTimestamp,
  type DispatchMeta,
} from './rider-dispatch-meta.ts';
import {
  isRiderDeliveringOrder,
} from './rider-dispatch-view.ts';

export function readRiderDispatchOrderCourierPhone(order: {
  courierPhone?: string | null;
  courier_phone?: string | null;
}): string {
  return String(order?.courierPhone || order?.courier_phone || '').trim();
}

export function readRiderDispatchOrderRemarksJson(order: {
  remarksJson?: string | null;
  remarks_json?: string | null;
}): string {
  return String(order?.remarksJson || order?.remarks_json || '').trim();
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
  const orderPhone = readRiderDispatchOrderCourierPhone(order);
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

  const now = parseDispatchTimestamp(nowIso || new Date().toISOString());
  const expiresAt = parseDispatchTimestamp(meta.currentExpiresAt);
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
