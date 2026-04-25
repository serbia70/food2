import assert from 'node:assert/strict';
import test from 'node:test';

import { runSharedRiderProgressAction } from './rider-route-shared.ts';
import { readRouteSource } from './rider-action-test-helpers.ts';

test('rider/action route uses shared non-decline progress helper for accept picked_up complete', () => {
  assert.equal(typeof runSharedRiderProgressAction, 'function');
  const source = readRouteSource('../pages/api/rider/action.ts');

  assert.match(source, /runSharedRiderProgressAction\(/);
  assert.doesNotMatch(source, /syncTelegramDeliveryProgressMessage\(/);
});
