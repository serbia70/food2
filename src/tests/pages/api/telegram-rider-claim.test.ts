process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { POST } from '../../../pages/api/telegram/rider-claim.ts';

test('POST rider-claim 在 secret 错误时返回 401', async () => {
  const request = new Request('http://localhost/api/telegram/rider-claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-claim-secret': 'wrong-secret',
    },
    body: JSON.stringify({
      callback_data: 'ignored',
      chat_id: 'chat-3',
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'unauthorized_telegram_request',
  });
});

test('POST rider-claim 在 chat_id 不匹配时返回 400', async () => {
  const originalFetch = globalThis.fetch;

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

    globalThis.fetch = async () => {
      throw new Error('update_status should not be called');
    };

    const request = new Request('http://localhost/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_data: callbackData,
        chat_id: 'chat-other',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'rider_identity_mismatch',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST rider-claim 在 callback 已过期时返回 400', async () => {
  const originalFetch = globalThis.fetch;

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
    const decoded = JSON.parse(Buffer.from(callbackData, 'base64url').toString('utf8')) as Record<string, unknown>;
    decoded.expiresAt = Date.now() - 1000;
    const expiredCallbackData = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    globalThis.fetch = async () => {
      throw new Error('update_status should not be called');
    };

    const request = new Request('http://localhost/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_data: expiredCallbackData,
        chat_id: 'chat-3',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'expired_callback',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST rider-claim 在 callback_data 非法时返回统一错误码 400', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error('update_status should not be called');
    };

    const request = new Request('http://localhost/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_data: 'not-valid-base64url',
        chat_id: 'chat-3',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'invalid_callback_data',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST rider-claim 在 list_available 不可用时仍可按签名 payload 接单', async () => {
  const originalFetch = globalThis.fetch;

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

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
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
    };

    const request = new Request('http://localhost/api/telegram/rider-claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_data: callbackData,
        chat_id: 'chat-3',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
