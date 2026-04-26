import {
  readDispatchMetaFromRemarks,
} from './rider-dispatch-meta.ts';
import {
  resolveRiderOrderAction,
} from './rider-dispatch-order-action.ts';
import {
  readRiderDispatchOrderCourierPhone,
  readRiderDispatchOrderRemarksJson,
} from './rider-dispatch-state.ts';

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
    remarksJson: readRiderDispatchOrderRemarksJson(input.order),
    courierPhone: readRiderDispatchOrderCourierPhone(input.order),
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
