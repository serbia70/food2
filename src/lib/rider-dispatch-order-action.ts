import type { Rider } from '../types/index.ts';
import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  type DispatchMeta,
} from './rider-dispatch-meta.ts';
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
