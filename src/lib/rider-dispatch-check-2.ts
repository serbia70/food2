import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiderUnifiedStatus } from './rider-dispatch.ts';

test('resolveRiderUnifiedStatus primaryAction check with empty remarks meta', () => {
  const status = 'picked_up';

  // Empty remarks meta (no currentRiderId)
  const remarksJson = JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"","currentAssignedAt":"","currentExpiresAt":"","invalidatedRiderIds":[],"lastInvalidationReason":null,"acceptedAt":"","pickedUpAt":"","completedAt":"","telegramMessageRef":null}']);

  const input = {
    status,
    remarksJson,
    courierPhone: '0613083888',
  };
  const rider = {
    riderId: '202', // Rider is active
    riderPhone: '0613083888',
  };

  const result = resolveRiderUnifiedStatus(input, rider);

  // Even if meta lacks currentRiderId, if courierPhone matches, getRiderDispatchState should return canComplete: true
  assert.equal(result.primaryAction, '送达', `Expected '送达', got '${result.primaryAction}'`);
});
