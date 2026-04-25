import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import {
  buildAdminInvalidActionResponse,
  buildAdminOrderIdRequiredResponse,
  buildAdminTelegramCompletionResponse,
  finalizeAdminTelegramCompletionResponse,
  readAdminAssignableRidersOrResponse,
  updateAdminOrderStatusOrResponse,
} from './rider-route-shared.ts';

const TEST_API_BASE = 'https://api.example.com';

type FetchHandler = (request: Request) => Promise<Response>;

type MockCall = {
  url: string;
  method: string;
  body: string;
  headers: Headers;
};

function useMockFetch(t: TestContext, handler: FetchHandler): MockCall[] {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createCookies(): { get: () => undefined } {
  return { get: () => undefined };
}

test('buildAdminOrderIdRequiredResponse 保持 400 和 order_id_required 契约', async () => {
  const response = buildAdminOrderIdRequiredResponse();
  const body = JSON.parse(await response.text()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, 'order_id_required');
});

test('buildAdminInvalidActionResponse 保持 400 与错误码契约', async () => {
  const invalidActionResponse = buildAdminInvalidActionResponse('invalid_action');
  const invalidActionBody = JSON.parse(await invalidActionResponse.text()) as { success: boolean; error: string };
  assert.equal(invalidActionResponse.status, 400);
  assert.equal(invalidActionBody.success, false);
  assert.equal(invalidActionBody.error, 'invalid_action');

  const unsupportedActionResponse = buildAdminInvalidActionResponse('unsupported_action');
  const unsupportedActionBody = JSON.parse(await unsupportedActionResponse.text()) as { success: boolean; error: string };
  assert.equal(unsupportedActionResponse.status, 400);
  assert.equal(unsupportedActionBody.success, false);
  assert.equal(unsupportedActionBody.error, 'unsupported_action');
});

test('finalizeAdminTelegramCompletionResponse 不再暴露 warning，但保持 telegram_notification 契约', async (t) => {
  useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      return jsonResponse({ success: true, orders: [] }, 404);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await finalizeAdminTelegramCompletionResponse({
    request: new Request('https://example.com/api/admin/rider-assign', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    orderId: '901',
    messageRef: { chatId: 'chat-1', messageId: 7788 },
    successPayload: {
      telegram_notification: { success: false, error: 'telegram_down' },
    },
  });
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    warning?: { code: string };
    telegram_notification?: { success: boolean; error: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.warning, undefined);
  assert.deepEqual(body.telegram_notification, { success: false, error: 'telegram_down' });
});

test('buildAdminTelegramCompletionResponse 对 publish 契约应用 transform 并移除历史字段', async () => {
  const response = buildAdminTelegramCompletionResponse({
    successPayload: {
      telegram_dispatch: {
        availableRiderCount: 3,
        telegramBoundCount: 2,
        deliveredCount: 1,
        failedCount: 1,
        attempts: [{ riderId: '202', riderName: 'Rider 1', riderPhone: '381641234567', telegramChatIdBound: true, delivered: true }],
        telegramMessageRef: { chatId: 'chat-1', messageId: 7788 },
      },
    },
    transformTelegramDispatch: (summary) => {
      const normalized = { ...summary } as Record<string, unknown>;
      delete normalized.availableRiderCount;
      delete normalized.telegramBoundCount;
      delete normalized.deliveredCount;
      delete normalized.telegramMessageRef;
      if (Array.isArray(summary.attempts)) {
        normalized.attempts = summary.attempts.map(({ delivered, error }) => ({
          delivered,
          ...(error ? { error } : {}),
        }));
      }
      return normalized;
    },
  });
  const body = JSON.parse(await response.text()) as {
    success: boolean;
    warning?: { code: string };
    telegram_dispatch: Record<string, unknown>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.warning, undefined);
  assert.equal(body.telegram_dispatch.failedCount, 1);
  assert.deepEqual(body.telegram_dispatch.attempts, [{ delivered: true }]);
  assert.equal(body.telegram_dispatch.availableRiderCount, undefined);
  assert.equal(body.telegram_dispatch.telegramBoundCount, undefined);
  assert.equal(body.telegram_dispatch.deliveredCount, undefined);
  assert.equal(body.telegram_dispatch.telegramMessageRef, undefined);
});

test('updateAdminOrderStatusOrResponse 保持失败 update 的错误响应契约', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/orders/901/status') {
      return jsonResponse({ success: false, error: 'status_failed' }, 409);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await updateAdminOrderStatusOrResponse({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    orderId: '901',
    payload: { status: 'awaiting_courier' },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 409);
  assert.deepEqual(JSON.parse(await result.response.text()), {
    success: false,
    error: 'order_update_failed',
  });
  assert.equal(calls.length, 1);
});

test('readAdminAssignableRidersOrResponse 保持 coerce2xxTo502 契约', async (t) => {
  const calls = useMockFetch(t, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/riders') {
      return jsonResponse({ success: false, error: 'riders_upstream_failed' }, 200);
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const result = await readAdminAssignableRidersOrResponse({
    request: new Request('https://example.com/api/admin/rider-dispatch', { method: 'POST' }),
    cookies: createCookies() as never,
    apiBaseUrl: TEST_API_BASE,
    coerce2xxTo502: true,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 502);
  assert.deepEqual(JSON.parse(await result.response.text()), {
    success: false,
    error: 'riders_upstream_failed',
  });
  assert.equal(calls.length, 1);
});
