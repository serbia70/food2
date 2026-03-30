process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_BIND_SECRET = 'test-telegram-bind-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRiderTelegramBindToken } from '../../../lib/telegram-rider-bind.ts';
import { buildTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { POST } from '../../../pages/api/telegram/webhook.ts';

test('POST telegram webhook 在 /start bind token 时转发到 rider-bind', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const bindToken = buildRiderTelegramBindToken({
      riderId: 7,
      riderPhone: '0613083899',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, 'test-telegram-bind-secret');

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, 'http://localhost/api/telegram/rider-bind');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['x-telegram-bot-api-secret-token'], 'test-telegram-callback-secret');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        bind_token: bindToken,
        chat_id: 'chat-7',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const request = new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        message: {
          text: `/start bind_${bindToken}`,
          chat: { id: 'chat-7' },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, route: 'rider-bind' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST telegram webhook 在 callback_query 时转发到 rider-claim', async () => {
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
      assert.equal(url, 'http://localhost/api/telegram/rider-claim');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['x-telegram-claim-secret'], 'test-telegram-callback-secret');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        callback_data: callbackData,
        chat_id: 'chat-3',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const request = new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_query: {
          data: callbackData,
          message: { chat: { id: 'chat-3' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, route: 'rider-claim' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST telegram webhook 在 secret 错误时返回 401', async () => {
  const request = new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    body: JSON.stringify({ message: { text: '/start bind_xxx', chat: { id: 'chat-7' } } }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'unauthorized_telegram_request',
  });
});

test('POST telegram webhook 在非绑定命令时安全忽略', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error('unexpected upstream call');
    };

    const request = new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        message: {
          text: '/start',
          chat: { id: 'chat-7' },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      ignored: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
