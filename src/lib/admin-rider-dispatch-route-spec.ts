import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as handleAdminRiderDispatch } from '../pages/api/admin/rider-dispatch.ts';

function createCookies(): { get: () => undefined } {
  return { get: () => undefined };
}

test('dispatch route 缺少 orderId 时返回 order_id_required', async () => {
  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publish',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_id_required');
});

test('dispatch route 不支持的 action 返回 unsupported_action', async () => {
  const response = await handleAdminRiderDispatch({
    request: new Request('https://example.com/api/admin/rider-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '901',
        action: 'unknown_action',
      }),
    }),
    cookies: createCookies(),
  } as never);
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'unsupported_action');
});
