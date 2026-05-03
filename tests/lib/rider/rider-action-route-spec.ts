import assert from 'node:assert/strict';
import test from 'node:test';

import { runSharedRiderProgressAction } from '../../../src/lib/rider-route-progress.ts';
import { readRouteSource } from './rider-progress-test-helpers.ts';

test('rider/action route uses shared non-decline progress helper for accept picked_up complete', () => {
  assert.equal(typeof runSharedRiderProgressAction, 'function');
  const source = readRouteSource('../../../src/pages/api/rider/action.ts');

  assert.match(source, /runSharedRiderProgressAction\(/);
  assert.doesNotMatch(source, /syncTelegramDeliveryProgressMessage\(/);
});

