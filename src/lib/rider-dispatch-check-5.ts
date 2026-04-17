import assert from 'node:assert/strict';
import test from 'node:test';
import { readDispatchMetaFromRemarks } from './rider-dispatch.ts';

test('readDispatchMetaFromRemarks handles remarks without riderId gracefully', () => {
  const remarksJson = JSON.stringify(['dispatch_meta:{"lastRiderDecision":null}']);
  const meta = readDispatchMetaFromRemarks(remarksJson);
  assert.equal(meta.currentRiderId, '', 'Should be empty string');
});
