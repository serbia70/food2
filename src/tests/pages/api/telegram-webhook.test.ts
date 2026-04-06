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
      assert.equal(url, 'https://food2.serbia70.com/api/telegram/rider-bind');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['x-telegram-bot-api-secret-token'], 'test-telegram-callback-secret');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        bindToken: bindToken,
        chatId: 'chat-7',
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

test('POST telegram webhook 在 callback_query 时直接执行 rider-claim 逻辑而不是自调 HTTP', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
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
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 3, name: '陈工', phone: '0601', telegramChatId: 'chat-3', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 88, remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/admin/orders/remarks') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/order/update_status') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
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
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
  }
});

test('POST telegram webhook 在 decline callback_query 时直接执行 rider-claim 逻辑', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 89,
      riderId: 4,
      riderName: '拒单骑手',
      riderPhone: '0602',
      restaurantId: '101',
      telegramChatId: 'chat-4',
      expiresAt: Date.now() + 60_000,
      action: 'decline',
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 4, name: '拒单骑手', phone: '0602', telegramChatId: 'chat-4', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 89, remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/admin/orders/remarks') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
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
          message: { chat: { id: 'chat-4' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, route: 'rider-claim' });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
  }
});

test('POST telegram webhook 在 callback_query 成功后返回 answerCallbackQuery 结果给 Telegram', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 90,
      riderId: 5,
      riderName: '接单骑手',
      riderPhone: '0605',
      restaurantId: '101',
      telegramChatId: 'chat-5',
      expiresAt: Date.now() + 60_000,
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 5, name: '接单骑手', phone: '0605', telegramChatId: 'chat-5', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 90, remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/admin/orders/remarks') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/order/update_status') {
        return new Response(JSON.stringify({ success: true, action: 'accept' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const request = new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        callback_query: {
          id: 'cbq-90',
          data: callbackData,
          message: { chat: { id: 'chat-5' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      method: 'answerCallbackQuery',
      callback_query_id: 'cbq-90',
      text: '已接单',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
  }
});

test('POST telegram webhook 在配置 PUBLIC_SITE_URL 时 callback 仍直接执行 rider-claim 逻辑', async () => {
  const originalFetch = globalThis.fetch;
  const previousSiteUrl = process.env.PUBLIC_SITE_URL;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_SITE_URL = 'https://food2.serbia70.com';
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 91,
      riderId: 6,
      riderName: '公网骑手',
      riderPhone: '0606',
      restaurantId: '101',
      telegramChatId: 'chat-6',
      expiresAt: Date.now() + 60_000,
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 6, name: '公网骑手', phone: '0606', telegramChatId: 'chat-6', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 91, remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/admin/orders/remarks') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/order/update_status') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
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
          message: { chat: { id: 'chat-6' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, route: 'rider-claim' });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previousSiteUrl;
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
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
