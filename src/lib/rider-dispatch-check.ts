import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiderUnifiedStatus } from './rider-dispatch.ts';

test('resolveRiderUnifiedStatus primaryAction check with proper input', () => {
  // Simulate the data structure usually found in orders
  const status = 'picked_up';
  const meta = {
    lastRiderDecision: {
      action: 'accepted',
      riderId: '202',
      riderName: '骑手888',
      riderPhone: '0613083888',
      at: '2026-04-17T10:03:00.000Z'
    },
    declinedRiderIds: [],
    currentRiderId: '202',
    currentAssignedAt: '2026-04-17T10:00:00.000Z',
    currentExpiresAt: '2026-04-17T10:10:00.000Z',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '2026-04-17T10:03:00.000Z',
    pickedUpAt: '2026-04-17T10:20:00.000Z',
    completedAt: '',
    telegramMessageRef: { chatId: '123456789', messageId: 7788 }
  };
  const remarksJson = JSON.stringify(['dispatch_meta:' + JSON.stringify(meta)]);

  const input = {
    status,
    remarksJson,
    courierPhone: '0613083888',
  };
  const rider = {
    riderId: '202',
    riderPhone: '0613083888',
  };

  const result = resolveRiderUnifiedStatus(input, rider);

  // Verify the primary action is returned correctly
  assert.equal(result.primaryAction, '送达', `Expected '送达', got '${result.primaryAction}'`);
});
