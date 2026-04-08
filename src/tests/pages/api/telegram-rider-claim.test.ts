process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';
process.env.JWT_SECRET = 'test-telegram-callback-secret';
process.env.PUBLIC_API_URL = 'http://localhost';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramClaimCallback, buildTelegramShortClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { POST } from '../../../pages/api/telegram/rider-claim.ts';

type FetchFn = typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createClaimRequest(body: string, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-claim-secret': 'test-telegram-callback-secret',
      ...(headers || {}),
    },
    body,
  });
}

function withMockedFetch(fn: FetchFn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function buildOrderRow(id: number | string, remarksJson = '') {
  return { id, remarksJson };
}

test('POST rider-claim 在 secret 错误时返回 401', async () => {
  const request = new Request('http://localhost/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-claim-secret': 'wrong-secret',
    },
    body: JSON.stringify({
      callbackData: 'ignored',
      chatId: 'chat-3',
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'unauthorized_telegram_request',
  });
});

test('POST rider-claim 支持 x-telegram-bot-api-secret-token 作为备用鉴权头', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(108)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    assert.equal(url, 'http://localhost/api/order/update_status/108');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 108,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
    return jsonResponse({ success: true });
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }), {
      'x-telegram-claim-secret': '',
      'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 JSON 非法时返回 invalid_json', async () => {
  const request = createClaimRequest('{');
  const response = await POST({ request } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'invalid_json',
  });
});

test('POST rider-claim 在生产基址下会通过 API_BASE_URL 调用内部代理而不是当前 origin', async () => {
  const calls: string[] = [];
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);

    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 31, name: '线上骑手', phone: '06131', status: 'available', telegramChatId: 'chat-31' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(131)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/131') {
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        id: 131,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '线上骑手',
        courier_phone: '06131',
      });
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 131,
      riderId: 31,
      riderName: '线上骑手',
      riderPhone: '06131',
      restaurantId: '103',
      telegramChatId: 'chat-31',
      expiresAt: Date.now() + 60_000,
    });

    const request = new Request('https://food2.serbia70.com/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({ callbackData, chatId: 'chat-31' }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      'http://localhost/api/rider/status?action=list_available',
      'http://localhost/api/admin/orders',
      'http://localhost/api/admin/orders',
      'http://localhost/api/admin/orders/remarks',
      'http://localhost/api/order/update_status/131',
      'http://localhost/api/admin/orders',
      'http://localhost/api/telegram/send',
    ]);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 callbackData 缺失时返回 callback_data_required', async () => {
  const request = createClaimRequest(JSON.stringify({ chatId: 'chat-3' }));
  const response = await POST({ request } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'callback_data_required',
  });
});

test('POST rider-claim 在 chatId 缺失时返回 chat_id_required', async () => {
  const callbackData = buildTelegramClaimCallback({
    orderId: 88,
    riderId: 3,
    riderName: '陈工',
    riderPhone: '0601',
    restaurantId: '101',
    telegramChatId: 'chat-3',
    expiresAt: Date.now() + 60_000,
  });
  const request = createClaimRequest(JSON.stringify({ callbackData }));
  const response = await POST({ request } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'chat_id_required',
  });
});

test('POST rider-claim consumes short callback payload', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 3, name: '陈工', phone: '0601', status: 'available', telegramChatId: 'chat-3' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(88)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/88') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 88,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '陈工',
        courier_phone: '0601',
      });
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 88,
      riderId: 3,
      riderName: '陈工',
      riderPhone: '0601',
      restaurantId: '101',
      telegramChatId: 'chat-3',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-3' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 decline callback 合法时通过 update_status 持久化拒单反馈且不改订单状态', async () => {
  let updateStatusPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 4, name: '拒单骑手', phone: '0602', status: 'available', telegramChatId: 'chat-4' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(89)]);
    }
    if (url === 'http://localhost/api/order/update_status/89') {
      updateStatusPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 89,
      riderId: 4,
      riderName: '拒单骑手',
      riderPhone: '0602',
      restaurantId: '101',
      telegramChatId: 'chat-4',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-4' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'decline', reassigned: false });
    assert.equal(updateStatusPayload?.id, 89);
    assert.equal(updateStatusPayload?.status, 'awaiting_courier');
    const remarksJson = String(updateStatusPayload?.remarks_json || '');
    assert.ok(remarksJson.includes('dispatch_meta:'));
    const persistedRemarks = JSON.parse(remarksJson) as string[];
    const declineMeta = JSON.parse(String(persistedRemarks[0] || '').replace(/^dispatch_meta:/, '')) as Record<string, unknown>;
    assert.deepEqual(declineMeta, {
      lastRiderDecision: {
        action: 'declined',
        riderId: '4',
        riderName: '拒单骑手',
        riderPhone: '0602',
        at: String((declineMeta.lastRiderDecision as Record<string, unknown>)?.at || ''),
      },
      declinedRiderIds: ['4'],
      currentRiderId: '',
      currentAssignedAt: '',
      currentExpiresAt: '',
      invalidatedRiderIds: ['4'],
      lastInvalidationReason: 'declined',
    });
    assert.ok(!Number.isNaN(Date.parse(String((declineMeta.lastRiderDecision as Record<string, unknown>)?.at || ''))));
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在骑手已失效时返回 dispatch_invalidated 409', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"8","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":["7"],"lastInvalidationReason":"reassigned"}',
  ]);

  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [{ id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' }],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(201, remarksJson)]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 201,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'dispatch_invalidated',
      reason: '已改派',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在当前有效骑手为空时也拒绝旧 callback', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":{"action":"declined","riderId":"9","riderName":"别的骑手","riderPhone":"0619","at":"2026-04-07T10:01:00.000Z"},"declinedRiderIds":["9"],"currentRiderId":"","currentAssignedAt":"","currentExpiresAt":"","invalidatedRiderIds":["9"],"lastInvalidationReason":"declined"}',
  ]);

  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [{ id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' }],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(203, remarksJson)]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 203,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'dispatch_invalidated',
      reason: '已改派',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在当前骑手 decline 时立即续派下一位骑手', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]);

  const calls: string[] = [];
  let dispatchPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' },
          { id: 8, name: '骑手B', phone: '0618', status: 'available', telegramChatId: 'chat-8' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(202, remarksJson)]);
    }
    if (url === 'http://localhost/api/order/update_status/202') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/admin/rider-dispatch') {
      dispatchPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 202,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'decline', reassigned: true });
    assert.ok(calls.includes('http://localhost/api/admin/rider-dispatch'));
    assert.deepEqual(dispatchPayload, {
      orderId: 202,
      action: 'publish',
      forceRiderId: '8',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 decline 落库失败时返回上游失败且不假成功', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]);

  const calls: string[] = [];
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' },
          { id: 8, name: '骑手B', phone: '0618', status: 'available', telegramChatId: 'chat-8' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(204, remarksJson)]);
    }
    if (url === 'http://localhost/api/order/update_status/204') {
      return jsonResponse({ success: false, error: 'write_failed' }, 503);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 204,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { success: false, error: 'write_failed' });
    assert.equal(calls.includes('http://localhost/api/admin/rider-dispatch'), false);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 decline 后续派请求抛异常时仍返回拒单成功', async () => {
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"lastRiderDecision":null,"declinedRiderIds":[],"currentRiderId":"7","currentAssignedAt":"2026-04-07T10:00:00.000Z","currentExpiresAt":"2099-04-07T10:05:00.000Z","invalidatedRiderIds":[],"lastInvalidationReason":null}',
  ]);

  let riderStatusCalls = 0;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      riderStatusCalls += 1;
      if (riderStatusCalls === 1) {
        return jsonResponse({
          success: true,
          riders: [{ id: 7, name: '骑手A', phone: '0617', status: 'available', telegramChatId: 'chat-7' }],
        });
      }
      throw new Error('redispatch network error');
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(205, remarksJson)]);
    }
    if (url === 'http://localhost/api/order/update_status/205') {
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 205,
      riderId: 7,
      riderName: '骑手A',
      riderPhone: '0617',
      restaurantId: '101',
      telegramChatId: 'chat-7',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });
    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-7' })) } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'decline', reassigned: false });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 accept callback 合法时先写回接单反馈再更新订单状态', async () => {
  const calls: string[] = [];
  let remarksPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(108)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      remarksPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    assert.equal(url, 'http://localhost/api/order/update_status/108');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 108,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
    return jsonResponse({ success: true });
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(remarksPayload?.orderId, '108');
    assert.ok(Array.isArray(remarksPayload?.remarks));
    const acceptMeta = JSON.parse(String((remarksPayload?.remarks as unknown[])[0] || '').replace(/^dispatch_meta:/, '')) as Record<string, unknown>;
    assert.deepEqual(acceptMeta, {
      lastRiderDecision: {
        action: 'accepted',
        riderId: '6',
        riderName: '骑手888',
        riderPhone: '0613888',
        at: String((acceptMeta.lastRiderDecision as Record<string, unknown>)?.at || ''),
      },
      declinedRiderIds: [],
    });
    assert.ok(!Number.isNaN(Date.parse(String((acceptMeta.lastRiderDecision as Record<string, unknown>)?.at || ''))));
    assert.ok(calls.indexOf('http://localhost/api/admin/orders/remarks') < calls.indexOf('http://localhost/api/order/update_status/108'));
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 remarks 写回未授权时仍继续更新订单状态', async () => {
  let updateStatusPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(108)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    if (url === 'http://localhost/api/order/update_status/108') {
      updateStatusPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(updateStatusPayload, {
      id: 108,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim updates order to delivering with courier info from signed callback', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(108)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    assert.equal(url, 'http://localhost/api/order/update_status/108');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 108,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 admin orders 未授权时仍给骑手发送已取餐消息', async () => {
  const calls: string[] = [];
  let telegramSendPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    if (url === 'http://localhost/api/order/update_status/108') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/rider/orders?phone=0613888&view=active') {
      return jsonResponse({
        success: true,
        orders: [{
          id: 108,
          orderNo: 'A108',
          tableInfo: 'Cara Lazara 108',
          userPhone: '060108',
          totalAmount: 2080,
          pickupEtaMinutes: 16,
          status: 'delivering',
          courierPhone: '0613888',
        }],
      });
    }
    if (url === 'http://localhost/api/telegram/send') {
      telegramSendPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true, ok: true });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.ok(calls.includes('http://localhost/api/rider/orders?phone=0613888&view=active'));
    assert.equal(telegramSendPayload?.chat_id, 'chat-888');
    assert.match(String(telegramSendPayload?.text || ''), /已接单/);
    const replyMarkup = telegramSendPayload?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
    const pickedUpButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '已取餐');
    assert.ok(pickedUpButton?.callback_data);
    assert.match(String(pickedUpButton?.callback_data || ''), /^rc2\./);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 accept 后给骑手发送已取餐消息', async () => {
  let telegramSendPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([{
        id: 108,
        orderNo: 'A108',
        tableInfo: 'Cara Lazara 108',
        userPhone: '060108',
        totalAmount: 2080,
        pickupEtaMinutes: 16,
        remarksJson: '',
        status: 'awaiting_courier',
      }]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/108') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/telegram/send') {
      telegramSendPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true, ok: true });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' }));
    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(telegramSendPayload?.chat_id, 'chat-888');
    assert.match(String(telegramSendPayload?.text || ''), /已接单/);
    const replyMarkup = telegramSendPayload?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
    const pickedUpButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '已取餐');
    assert.ok(pickedUpButton?.callback_data);
    assert.match(String(pickedUpButton?.callback_data || ''), /^rc2\./);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 picked_up callback 合法时更新订单为 picked_up 并发送已送达消息', async () => {
  const calls: string[] = [];
  let updateStatusPayload: Record<string, unknown> | null = null;
  let telegramSendPayload: Record<string, unknown> | null = null;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([{
        id: 108,
        orderNo: 'A108',
        tableInfo: 'Cara Lazara 108',
        userPhone: '060108',
        totalAmount: 2080,
        pickupEtaMinutes: 16,
        remarksJson: '',
        status: 'delivering',
        courierPhone: '0613888',
      }]);
    }
    if (url === 'http://localhost/api/order/update_status/108') {
      updateStatusPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/telegram/send') {
      telegramSendPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true, ok: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
      action: 'picked_up',
    });

    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' })) } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'picked_up' });
    assert.deepEqual(updateStatusPayload, {
      id: 108,
      expected_current_status: 'delivering',
      status: 'picked_up',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
    assert.ok(calls.indexOf('http://localhost/api/order/update_status/108') < calls.indexOf('http://localhost/api/telegram/send'));
    assert.equal(telegramSendPayload?.chat_id, 'chat-888');
    assert.match(String(telegramSendPayload?.text || ''), /已取餐/);
    const replyMarkup = telegramSendPayload?.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> } | undefined;
    const completeButton = replyMarkup?.inline_keyboard?.flat().find((button) => button?.text === '已送达');
    assert.ok(completeButton?.callback_data);
    assert.match(String(completeButton?.callback_data || ''), /^rc2\./);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 complete callback 合法时更新订单为 completed 且不再发送下一条 Telegram', async () => {
  let updateStatusPayload: Record<string, unknown> | null = null;
  let telegramSendCalls = 0;
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(108, '')]);
    }
    if (url === 'http://localhost/api/order/update_status/108') {
      updateStatusPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/telegram/send') {
      telegramSendCalls += 1;
      return jsonResponse({ success: true, ok: true });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 108,
      riderId: 6,
      riderName: '骑手888',
      riderPhone: '0613888',
      restaurantId: '101',
      telegramChatId: 'chat-888',
      expiresAt: Date.now() + 60_000,
      action: 'complete',
    });

    const response = await POST({ request: createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-888' })) } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: 'complete' });
    assert.deepEqual(updateStatusPayload, {
      id: 108,
      expected_current_status: 'picked_up',
      status: 'completed',
      courier_name: '骑手888',
      courier_phone: '0613888',
    });
    assert.equal(telegramSendCalls, 0);
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 chatId 不匹配时返回 400', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: true, riders: [] });
    }
    throw new Error('update_status should not be called');
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 88,
      riderId: 3,
      riderName: '陈工',
      riderPhone: '0601',
      restaurantId: '101',
      telegramChatId: 'chat-3',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-other' }));
    const response = await POST({ request } as any);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'rider_identity_mismatch',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 callback 已过期时返回 expired_callback', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: true, riders: [] });
    }
    throw new Error('update_status should not be called');
  });
  const originalNow = Date.now;

  try {
    const baseNow = 1_800_000_000_000;
    Date.now = () => baseNow;

    const callbackData = buildTelegramClaimCallback({
      orderId: 88,
      riderId: 3,
      riderName: '陈工',
      riderPhone: '0601',
      restaurantId: '101',
      telegramChatId: 'chat-3',
      expiresAt: baseNow + 1000,
    });

    Date.now = () => baseNow + 2000;

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-3' }));
    const response = await POST({ request } as any);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'expired_callback',
    });
  } finally {
    Date.now = originalNow;
    restoreFetch();
  }
});

test('POST rider-claim 在 callbackData 非法时返回统一错误码 400', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({
        success: true,
        riders: [
          { id: 3, name: '陈工', phone: '0601', status: 'available', telegramChatId: 'chat-3' },
        ],
      });
    }
    throw new Error('update_status should not be called');
  });

  try {
    const request = createClaimRequest(JSON.stringify({
      callbackData: 'not-valid-base64url',
      chatId: 'chat-3',
    }));

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'invalid_callback_data',
    });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 在 list_available 不可用时仍可按签名 payload 接单', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ error: 'not found' }, 404);
    }

    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(88)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/88') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 88,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '陈工',
        courier_phone: '0601',
      });
      return jsonResponse({ success: true });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramClaimCallback({
      orderId: 88,
      riderId: 3,
      riderName: '陈工',
      riderPhone: '0601',
      restaurantId: '101',
      telegramChatId: 'chat-3',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-3' }));
    const response = await POST({ request } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 使用短 callback 时优先回写 rider/status 返回的真实骑手姓名', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 18, name: '骑手188全名', phone: '061188', status: 'available', telegramChatId: 'chat-188' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(88)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/188') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 188,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '骑手188全名',
        courier_phone: '061188',
      });
      return jsonResponse({ success: true });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 188,
      riderId: 18,
      riderName: '骑手188超长全名',
      riderPhone: '061188',
      restaurantId: '101',
      telegramChatId: 'chat-188',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-188' }));
    const response = await POST({ request } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    restoreFetch();
  }
});

test('POST rider-claim 使用短 callback 时在 rider/status 不可用仍可接单', async () => {
  const calls: string[] = [];
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);

    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: false, error: 'upstream_down' }, 503);
    }

    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([buildOrderRow(88)]);
    }
    if (url === 'http://localhost/api/admin/orders/remarks') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/order/update_status/188') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 188,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '骑手188',
        courier_phone: '061188',
      });
      return jsonResponse({ success: true });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    const callbackData = buildTelegramShortClaimCallback({
      orderId: 188,
      riderId: 18,
      riderName: '骑手188',
      riderPhone: '061188',
      restaurantId: '101',
      telegramChatId: 'chat-188',
      expiresAt: Date.now() + 60_000,
    });

    const request = createClaimRequest(JSON.stringify({ callbackData, chatId: 'chat-188' }));
    const response = await POST({ request } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(calls.includes('http://localhost/api/order/update_status/188'), true);
  } finally {
    restoreFetch();
  }
});
