import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiderUnifiedStatus } from './rider-dispatch.ts';

test('resolveRiderUnifiedStatus primaryAction check with mismatched rider info', () => {
  const status = 'picked_up';

  const remarksJson = JSON.stringify(['dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"202","currentAssignedAt":"","currentExpiresAt":"","invalidatedRiderIds":[],"lastInvalidationReason":null,"acceptedAt":"","pickedUpAt":"","completedAt":"","telegramMessageRef":null}']);

  const input = {
    status,
    remarksJson,
    courierPhone: '0611', // Order assigned to 0611
  };
  const rider = {
    riderId: '999', // Different ID
    riderPhone: '0699', // Different Phone
  };

  const result = resolveRiderUnifiedStatus(input, rider);

  // Should return empty primaryAction
  assert.equal(result.primaryAction, '', `Expected empty primaryAction, got '${result.primaryAction}'`);
});
