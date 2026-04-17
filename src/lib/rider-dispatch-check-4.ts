import assert from 'node:assert/strict';
import test from 'node:test';
import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';

test('remarksJson order of operations when multiple meta entries exist', () => {
  // Simulate remarks array with old entry then new entry
  const metaOld = {
    currentRiderId: 'old-rider',
  };
  const metaNew = {
    currentRiderId: 'new-rider',
  };
  const remarks = [
    `dispatch_meta:${JSON.stringify(metaOld)}`,
    `dispatch_meta:${JSON.stringify(metaNew)}`,
  ];
  const remarksJson = JSON.stringify(remarks);

  const meta = readDispatchMetaFromRemarks(remarksJson);
  assert.equal(meta.currentRiderId, 'new-rider', 'Should pick the last meta entry');
});
