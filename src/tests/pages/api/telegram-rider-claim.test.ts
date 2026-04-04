process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';
process.env.JWT_SECRET = 'test-telegram-callback-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramClaimCallback, buildTelegramShortClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { POST } from '../../../pages/api/telegram/rider-claim.ts';

type FetchFn = typeof globalThis.fetch;

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
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url, 'http://localhost/api/order/update_status');
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
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 3, name: '陈工', phone: '0601', status: 'available', telegramChatId: 'chat-3' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'http://localhost/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 88,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '陈工',
        courier_phone: '0601',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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

test('POST rider-claim updates order to delivering with courier info from signed callback', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 6, name: '骑手888', phone: '0613888', status: 'available', telegramChatId: 'chat-888' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.equal(url, 'http://localhost/api/order/update_status');
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

test('POST rider-claim 在 chatId 不匹配时返回 400', async () => {
  const restoreFetch = withMockedFetch(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return new Response(JSON.stringify({ success: true, riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ success: true, riders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({
        success: true,
        riders: [
          { id: 3, name: '陈工', phone: '0601', status: 'available', telegramChatId: 'chat-3' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 88,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '陈工',
        courier_phone: '0601',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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

    if (url === 'http://localhost/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 188,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '骑手188全名',
        courier_phone: '061188',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ success: false, error: 'upstream_down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'http://localhost/api/order/update_status') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.deepEqual(body, {
        id: 188,
        expected_current_status: 'awaiting_courier',
        status: 'delivering',
        courier_name: '骑手188',
        courier_phone: '061188',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
    assert.equal(calls.includes('http://localhost/api/order/update_status'), true);
  } finally {
    restoreFetch();
  }
});
