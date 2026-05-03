import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as riderActionPost } from '../../../src/pages/api/rider/action.ts';
import {
  createActionRequest,
  createFetchHandler,
  createRemarksJson,
  readDispatchMetaFromRemarks,
  readJson,
  TEST_ORDER_ID,
  TEST_RIDER_ID,
  TEST_RIDER_NAME,
  TEST_RIDER_PHONE,
  useMockFetch,
  useTestEnv,
} from './rider-progress-test-helpers.ts';

test('decline 主链路只走 update_status + remarksJson', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, createFetchHandler({
    status: 'awaiting_courier',
    remarksJson: createRemarksJson({ declinedRiderIds: ['404'] }),
  }));

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'decline',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);
  const updateCall = calls.find((call) => call.url.endsWith(`/api/order/update_status/${TEST_ORDER_ID}`));

  assert.equal(response.status, 200);
  assert.equal(body.action, 'decline');
  assert.ok(updateCall);
  assert.ok(!calls.some((call) => call.url.endsWith('/api/admin/orders/remarks')));

  const updatePayload = JSON.parse(updateCall.body) as { remarksJson?: string };
  const nextMeta = readDispatchMetaFromRemarks(updatePayload.remarksJson || '');
  assert.equal(nextMeta.lastRiderDecision?.action, 'declined');
  assert.equal(nextMeta.currentRiderId, '');
});

test('无效入参返回 400 invalid_rider_action', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => {
    throw new Error('fetch should not be called');
  });

  const response = await riderActionPost({
    request: createActionRequest({
      action: 'invalid',
      orderId: String(TEST_ORDER_ID),
      riderId: String(TEST_RIDER_ID),
      riderName: TEST_RIDER_NAME,
      riderPhone: TEST_RIDER_PHONE,
    }),
  } as never);
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_rider_action');
  assert.equal(calls.length, 0);
});

