import assert from 'node:assert/strict';
import test from 'node:test';

import { runSharedRiderProgressAction } from './rider-route-shared.ts';
import { readRouteSource } from './telegram-rider-claim-test-helpers.ts';

test('telegram/rider-claim route uses shared non-decline progress helper and keeps decline path local', () => {
  assert.equal(typeof runSharedRiderProgressAction, 'function');
  const source = readRouteSource('../pages/api/telegram/rider-claim.ts');

  assert.match(source, /runSharedRiderProgressAction\(/);
  assert.doesNotMatch(source, /const nextActionTimes = \{/);
  assert.match(source, /if \(isDeclineAction\) \{/);
});
