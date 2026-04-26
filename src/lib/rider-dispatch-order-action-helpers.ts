import {
  buildDispatchMetaRemarks,
  type DispatchMeta,
} from './rider-dispatch-meta.ts';
import type { ResolveRiderOrderActionResult, RiderOrderAction } from './rider-dispatch-order-action.ts';

export function hasDispatchMetaConstraints(meta: DispatchMeta): boolean {
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

export function buildDisallowedResult({
  error,
  reason = '',
  expectedCurrentStatus,
  targetStatus,
}: {
  error: ResolveRiderOrderActionResult['error'];
  reason?: string;
  expectedCurrentStatus: string;
  targetStatus: string;
}): ResolveRiderOrderActionResult {
  return {
    allowed: false,
    error,
    reason,
    expectedCurrentStatus,
    targetStatus,
    nextRemarksJson: '',
    feedbackWriteMode: 'none',
    excludedRiderIds: [],
  };
}

export function buildDeclineActionResult({
  remarksJson,
  meta,
  riderId,
  riderName,
  riderPhone,
  nowIso,
}: {
  remarksJson: string;
  meta: DispatchMeta;
  riderId: string;
  riderName: string;
  riderPhone: string;
  nowIso: string;
}): ResolveRiderOrderActionResult {
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

export function buildAcceptActionResult({
  remarksJson,
  meta,
  riderId,
  riderName,
  riderPhone,
  nowIso,
}: {
  remarksJson: string;
  meta: DispatchMeta;
  riderId: string;
  riderName: string;
  riderPhone: string;
  nowIso: string;
}): ResolveRiderOrderActionResult {
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

export function readProgressStatuses(action: Extract<RiderOrderAction, 'picked_up' | 'complete'>) {
  return action === 'picked_up'
    ? { expectedCurrentStatus: 'delivering', targetStatus: 'picked_up' }
    : { expectedCurrentStatus: 'picked_up', targetStatus: 'completed' };
}
