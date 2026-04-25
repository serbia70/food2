import assert from 'node:assert/strict';
import test from 'node:test';

import { API_BASE_URL } from '../config.ts';
import { forwardOrderUpdateStatus } from '../pages/api/order/update_status.ts';
import { jsonResponse, useMockFetch, useTestEnv } from './order-update-status-test-helpers.ts';

test('forwardOrderUpdateStatus forwards cookie and authorization headers to upstream', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'admin_session=abc123',
      authorization: 'Bearer rider-token',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierPhone: '',
      courierName: '',
    }),
  }));

  assert.equal(response.status, 200);
  const forwardCall = calls.find((call) => call.url === `${API_BASE_URL}/api/order/update_status/101`);
  assert.ok(forwardCall);
  assert.equal(forwardCall.headers.get('cookie'), 'admin_session=abc123');
  assert.equal(forwardCall.headers.get('authorization'), 'Bearer rider-token');
});

test('forwardOrderUpdateStatus coerces numeric string id in body before forwarding', async (t) => {
  useTestEnv(t);
  const calls = useMockFetch(t, async () => jsonResponse({ success: true }));

  const response = await forwardOrderUpdateStatus(new Request('https://example.com/api/order/update_status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: '101',
      expectedCurrentStatus: 'delivering',
      status: 'picked_up',
      courierPhone: '',
      courierName: '',
    }),
  }));

  assert.equal(response.status, 200);
  const forwardCall = calls.find((call) => call.url === `${API_BASE_URL}/api/order/update_status/101`);
  assert.ok(forwardCall);
  assert.equal((JSON.parse(forwardCall.body) as { id?: unknown }).id, 101);
});
