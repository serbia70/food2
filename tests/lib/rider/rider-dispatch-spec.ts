import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDispatchMetaRemarks, filterRiderDashboardOrders } from '../../../src/lib/rider-dispatch.ts';

test('dispatch meta round-trip still exports from rider-dispatch barrel', () => {
  const remarks = JSON.stringify(buildDispatchMetaRemarks('', {
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
  }));

  assert.match(remarks, /dispatch_meta:/);
  assert.equal(typeof filterRiderDashboardOrders, 'function');
});

