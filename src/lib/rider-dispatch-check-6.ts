import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiderDashboardActionState } from './rider-dispatch.ts';

test('resolveRiderDashboardActionState canComplete check with empty riderId', () => {
  const state = resolveRiderDashboardActionState({
    order: {
      status: 'picked_up',
      remarksJson: '[]',
      courierPhone: '0611',
    },
    riderId: '', // EMPTY ID
    riderName: 'Rider',
    riderPhone: '0611',
    nowIso: new Date().toISOString(),
  });

  console.log('State canComplete:', state.canComplete);
  assert.equal(state.canComplete, true, 'Should be able to complete even if riderId is empty');
});
