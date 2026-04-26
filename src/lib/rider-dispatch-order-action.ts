import type { Rider } from '../types/index.ts';
import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  type DispatchMeta,
} from './rider-dispatch-meta.ts';
import {
  buildAcceptActionResult,
  buildDeclineActionResult,
  buildDisallowedResult,
  hasDispatchMetaConstraints,
  readProgressStatuses,
} from './rider-dispatch-order-action-helpers.ts';
import {
  buildContactableRiderRows,
} from './rider-dispatch-view.ts';
import {
  getRiderDispatchState,
  readRiderDispatchOrderCourierPhone,
  readRiderDispatchOrderRemarksJson,
} from './rider-dispatch-state.ts';

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
  const remarksJson = readRiderDispatchOrderRemarksJson(input.order);
  const status = String(input.order?.status || '').trim();
  const riderId = String(input.riderId || '').trim();
  const riderName = String(input.riderName || '').trim();
  const riderPhone = String(input.riderPhone || '').trim();
  const courierPhone = readRiderDispatchOrderCourierPhone(input.order);
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
  const enforceDispatchConstraints = hasDispatchMetaConstraints(meta);
  const deliveryProgressAllowedWithoutDispatchMeta = (action === 'picked_up' || action === 'complete')
    && !enforceDispatchConstraints
    && !!courierPhone
    && courierPhone === riderPhone;

  if (action === 'picked_up' || action === 'complete') {
    const { expectedCurrentStatus, targetStatus } = readProgressStatuses(action);
    if (status === 'completed') {
      return buildDisallowedResult({
        error: 'order_completed',
        expectedCurrentStatus,
        targetStatus,
      });
    }

    if (status && status !== expectedCurrentStatus) {
      return buildDisallowedResult({
        error: 'order_status_updated',
        expectedCurrentStatus,
        targetStatus,
      });
    }

    if (dispatchState.invalidReason) {
      return buildDisallowedResult({
        error: 'dispatch_invalidated',
        reason: dispatchState.invalidReason,
        expectedCurrentStatus,
        targetStatus,
      });
    }

    if (!deliveryProgressAllowedWithoutDispatchMeta && !dispatchState.canComplete) {
      return buildDisallowedResult({
        error: 'dispatch_invalidated',
        reason: '已改派',
        expectedCurrentStatus,
        targetStatus,
      });
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
    return buildDisallowedResult({
      error: status === 'completed' ? 'order_completed' : 'order_status_updated',
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
    });
  }

  if (dispatchState.invalidReason) {
    return buildDisallowedResult({
      error: 'dispatch_invalidated',
      reason: dispatchState.invalidReason,
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
    });
  }

  const actionAllowed = action === 'decline' ? dispatchState.canDecline : dispatchState.canAccept;
  if ((action === 'decline' || enforceDispatchConstraints) && !actionAllowed) {
    return buildDisallowedResult({
      error: 'dispatch_invalidated',
      reason: '已改派',
      expectedCurrentStatus: 'awaiting_courier',
      targetStatus: action === 'accept' ? 'delivering' : 'awaiting_courier',
    });
  }

  if (action === 'decline') {
    return buildDeclineActionResult({
      remarksJson,
      meta,
      riderId,
      riderName,
      riderPhone,
      nowIso,
    });
  }

  return buildAcceptActionResult({
    remarksJson,
    meta,
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });
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
