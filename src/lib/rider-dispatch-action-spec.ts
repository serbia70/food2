import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDispatchMetaRemarks,
  readDispatchMetaFromRemarks,
  resolveRiderDashboardActionState,
  resolveRiderOrderAction,
} from './rider-dispatch.ts';
import {
  buildRiderActionUpdateStatusPayload,
  buildRiderActionUpdateStatusRemarks,
} from './rider-route-shared.ts';

test('resolveRiderOrderAction allows picked_up fallback by courierPhone without dispatch_meta', () => {
  const result = resolveRiderOrderAction({
    action: 'picked_up',
    order: { status: 'delivering', remarksJson: '', courierPhone: '381641234567' },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.targetStatus, 'picked_up');
});

test('resolveRiderOrderAction rejects accept when order is no longer awaiting_courier', () => {
  const result = resolveRiderOrderAction({
    action: 'accept',
    order: { status: 'delivering', remarksJson: '', courierPhone: '381641234567' },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.error, 'order_status_updated');
});

test('resolveRiderOrderAction rejects accept when status is empty', () => {
  const result = resolveRiderOrderAction({
    action: 'accept',
    order: { status: '', remarksJson: '', courierPhone: '381641234567' },
    riderId: '202',
    riderName: 'Rider 1',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:00:00.000Z',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.error, 'order_status_updated');
});

test('buildRiderActionUpdateStatusRemarks reuses actionDecision remarks for accept and decline but writes progress timestamps for picked_up and complete', () => {
  const baseRemarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null,"acceptedAt":"2026-04-12T10:01:00.000Z","pickedUpAt":"","completedAt":"","telegramMessageRef":{"chatId":"123","messageId":7788}}',
  ]);
  const acceptDecision = resolveRiderOrderAction({ action: 'accept', order: { status: 'awaiting_courier', remarksJson: baseRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:00:00.000Z' });
  const declineDecision = resolveRiderOrderAction({ action: 'decline', order: { status: 'awaiting_courier', remarksJson: baseRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:00:00.000Z' });
  const pickedUpDecision = resolveRiderOrderAction({ action: 'picked_up', order: { status: 'delivering', remarksJson: baseRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:02:00.000Z' });
  const completeDecision = resolveRiderOrderAction({ action: 'complete', order: { status: 'picked_up', remarksJson: baseRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:03:00.000Z' });

  assert.equal(buildRiderActionUpdateStatusRemarks({ action: 'accept', remarksJson: baseRemarksJson, actionDecisionNextRemarksJson: acceptDecision.nextRemarksJson, acceptedAt: '2026-04-11T10:01:00.000Z', pickedUpAt: '', completedAt: '' }), acceptDecision.nextRemarksJson);
  assert.equal(buildRiderActionUpdateStatusRemarks({ action: 'decline', remarksJson: baseRemarksJson, actionDecisionNextRemarksJson: declineDecision.nextRemarksJson, acceptedAt: '2026-04-11T10:01:00.000Z', pickedUpAt: '', completedAt: '' }), declineDecision.nextRemarksJson);

  const pickedUpRemarks = readDispatchMetaFromRemarks(buildRiderActionUpdateStatusRemarks({
    action: 'picked_up',
    remarksJson: baseRemarksJson,
    actionDecisionNextRemarksJson: pickedUpDecision.nextRemarksJson,
    acceptedAt: '2026-04-11T10:01:00.000Z',
    pickedUpAt: '2026-04-12T10:02:00.000Z',
    completedAt: '',
  }));
  assert.equal(pickedUpRemarks.pickedUpAt, '2026-04-12T10:02:00.000Z');

  const completeRemarks = readDispatchMetaFromRemarks(buildRiderActionUpdateStatusRemarks({
    action: 'complete',
    remarksJson: baseRemarksJson,
    actionDecisionNextRemarksJson: completeDecision.nextRemarksJson,
    acceptedAt: '2026-04-11T10:01:00.000Z',
    pickedUpAt: '2026-04-12T10:02:00.000Z',
    completedAt: '2026-04-12T10:03:00.000Z',
  }));
  assert.equal(completeRemarks.completedAt, '2026-04-12T10:03:00.000Z');
});

test('buildRiderActionUpdateStatusPayload omits courier fields only for update_status_remarks mode but keeps remarks for progress actions', () => {
  const dispatchRemarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null,"acceptedAt":"2026-04-12T10:01:00.000Z","pickedUpAt":"","completedAt":"","telegramMessageRef":{"chatId":"123","messageId":7788}}',
  ]);
  const declineDecision = resolveRiderOrderAction({ action: 'decline', order: { status: 'awaiting_courier', remarksJson: dispatchRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:00:00.000Z' });
  const acceptDecision = resolveRiderOrderAction({ action: 'accept', order: { status: 'awaiting_courier', remarksJson: dispatchRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:00:00.000Z' });
  const pickedUpDecision = resolveRiderOrderAction({ action: 'picked_up', order: { status: 'delivering', remarksJson: dispatchRemarksJson, courierPhone: '381641234567' }, riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', nowIso: '2026-04-12T10:02:00.000Z' });

  const declinePayload = buildRiderActionUpdateStatusPayload({ orderId: '101', action: 'decline', expectedCurrentStatus: declineDecision.expectedCurrentStatus, targetStatus: declineDecision.targetStatus, feedbackWriteMode: declineDecision.feedbackWriteMode, nextRemarksJson: declineDecision.nextRemarksJson, riderName: 'Rider 1', riderPhone: '381641234567' });
  assert.equal(Object.hasOwn(declinePayload, 'courierName'), false);

  const acceptPayload = buildRiderActionUpdateStatusPayload({ orderId: '101', action: 'accept', expectedCurrentStatus: acceptDecision.expectedCurrentStatus, targetStatus: acceptDecision.targetStatus, feedbackWriteMode: acceptDecision.feedbackWriteMode, nextRemarksJson: acceptDecision.nextRemarksJson, riderName: 'Rider 1', riderPhone: '381641234567' });
  assert.equal(acceptPayload.courierName, 'Rider 1');

  const pickedUpPayload = buildRiderActionUpdateStatusPayload({ orderId: '101', action: 'picked_up', expectedCurrentStatus: pickedUpDecision.expectedCurrentStatus, targetStatus: pickedUpDecision.targetStatus, feedbackWriteMode: pickedUpDecision.feedbackWriteMode, nextRemarksJson: '["patched"]', riderName: 'Rider 1', riderPhone: '381641234567' });
  assert.equal(pickedUpPayload.remarksJson, '["patched"]');
});

test('resolveRiderDashboardActionState hides accept and decline when currentRiderId belongs to another rider', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'awaiting_courier',
      remarksJson: JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"other-rider","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}']),
      courierPhone: '381641234567',
    },
    riderId: 'current-rider',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:03:00.000Z',
  });
  assert.equal(state.canAccept, false);
  assert.equal(state.invalidReason, '已改派');
});

test('resolveRiderDashboardActionState hides accept and decline when current rider is already timed out', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'awaiting_courier',
      remarks_json: JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"current-rider","currentAssignedAt":"2026-04-12T10:00:00.000Z","currentExpiresAt":"2026-04-12T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}']),
      courier_phone: '381641234567',
    },
    riderId: 'current-rider',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:06:00.000Z',
  });
  assert.equal(state.canAccept, false);
  assert.equal(state.invalidReason, '接单超时');
});

test('resolveRiderDashboardActionState does not expose invalidReason for valid delivering pickup flow', () => {
  const state = resolveRiderDashboardActionState({
    order: { status: 'delivering', remarksJson: '', courierPhone: '381641234567' },
    riderId: '202',
    riderPhone: '381641234567',
    nowIso: '2026-04-12T10:06:00.000Z',
  });
  assert.equal(state.canPickUp, true);
  assert.equal(state.invalidReason, '');
});

test('dispatch_meta preserves action times and telegram message ref', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: { action: 'accepted', riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', at: '2026-04-14T10:03:00.000Z' },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-14T10:03:00.000Z',
    pickedUpAt: '2026-04-14T10:19:00.000Z',
    completedAt: '2026-04-14T10:41:00.000Z',
    telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
  }));
  const meta = readDispatchMetaFromRemarks(remarks);
  assert.deepEqual(meta.telegramMessageRef, { chatId: 'chat-1', messageId: 7788 });
});

test('dispatch_meta normalizes invalid telegramMessageRef to null', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
    lastRiderDecision: null,
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-14T10:00:00.000Z',
    currentExpiresAt: '2026-04-14T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '',
    pickedUpAt: '',
    completedAt: '',
    telegramMessageRef: { chatId: '', messageId: 0 },
  }));
  const meta = readDispatchMetaFromRemarks(remarks);
  assert.equal(meta.telegramMessageRef, null);
});
