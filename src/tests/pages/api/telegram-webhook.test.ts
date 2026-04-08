process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_BIND_SECRET = 'test-telegram-bind-secret';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { buildRiderTelegramBindToken } from '../../../lib/telegram-rider-bind.ts';
import { buildTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { POST } from '../../../pages/api/telegram/webhook.ts';

function buildExpiredTelegramClaimCallback(): string {
  const payload = {
    orderId: 93,
    riderId: 8,
    riderName: '过期骑手',
    riderPhone: '0608',
    restaurantId: '101',
    telegramChatId: 'chat-8',
    expiresAt: Date.now() - 60_000,
    action: 'accept',
  };
  const sig = createHmac('sha256', 'test-telegram-callback-secret')
    .update(JSON.stringify(payload))
    .digest('base64url');
  return Buffer.from(JSON.stringify({ ...payload, sig }), 'utf8').toString('base64url');
}

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

      if (url === 'https://api.test.local/api/order/update_status/88') {
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

      if (url === 'https://api.test.local/api/order/update_status/89') {
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

test('POST telegram webhook 在 callback_query 非法时仍返回 answerCallbackQuery 给 Telegram', async () => {
  const request = new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
    },
    body: JSON.stringify({
      callback_query: {
        id: 'cbq-92',
        data: 'not-valid-callback',
        message: { chat: { id: 'chat-7' } },
      },
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: 'answerCallbackQuery',
    callback_query_id: 'cbq-92',
    text: '操作失败',
  });
});

test('POST telegram webhook 在 callback_query 已过期时返回操作已过期', async () => {
  const callbackData = buildExpiredTelegramClaimCallback();

  const request = new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
    },
    body: JSON.stringify({
      callback_query: {
        id: 'cbq-93',
        data: callbackData,
        message: { chat: { id: 'chat-8' } },
      },
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: 'answerCallbackQuery',
    callback_query_id: 'cbq-93',
    text: '操作已过期',
  });
});

test('POST telegram webhook 在 rider-claim 返回非 JSON 失败时仍返回操作失败', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 94,
      riderId: 9,
      riderName: '非JSON骑手',
      riderPhone: '0609',
      restaurantId: '101',
      telegramChatId: 'chat-9',
      expiresAt: Date.now() + 60_000,
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 9, name: '非JSON骑手', phone: '0609', telegramChatId: 'chat-9', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 94, remarksJson: '' }]), {
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
      if (url === 'https://api.test.local/api/order/update_status/94') {
        return new Response('upstream exploded', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
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
          id: 'cbq-94',
          data: callbackData,
          message: { chat: { id: 'chat-9' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      method: 'answerCallbackQuery',
      callback_query_id: 'cbq-94',
      text: '操作失败',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
  }
});

test('POST telegram webhook 在 accept callback_query 成功后返回已接单', async () => {
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

      if (url === 'https://api.test.local/api/order/update_status/90') {
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

test('POST telegram webhook 在 picked_up callback_query 成功后返回已取餐', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 190,
      riderId: 15,
      riderName: '取餐骑手',
      riderPhone: '0615',
      restaurantId: '101',
      telegramChatId: 'chat-15',
      expiresAt: Date.now() + 60_000,
      action: 'picked_up',
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 15, name: '取餐骑手', phone: '0615', telegramChatId: 'chat-15', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 190, status: 'delivering', remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/order/update_status/190') {
        return new Response(JSON.stringify({ success: true, action: 'picked_up' }), {
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
          id: 'cbq-190',
          data: callbackData,
          message: { chat: { id: 'chat-15' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      method: 'answerCallbackQuery',
      callback_query_id: 'cbq-190',
      text: '已取餐',
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previousApiUrl;
  }
});

test('POST telegram webhook 在 complete callback_query 成功后返回已送达', async () => {
  const originalFetch = globalThis.fetch;
  const previousApiUrl = process.env.PUBLIC_API_URL;

  try {
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const callbackData = buildTelegramClaimCallback({
      orderId: 290,
      riderId: 25,
      riderName: '送达骑手',
      riderPhone: '0625',
      restaurantId: '101',
      telegramChatId: 'chat-25',
      expiresAt: Date.now() + 60_000,
      action: 'complete',
    });

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.notEqual(url, 'https://food2.serbia70.com/api/telegram/rider-claim');

      if (url === 'https://api.test.local/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 25, name: '送达骑手', phone: '0625', telegramChatId: 'chat-25', status: 'available' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.test.local/api/admin/orders') {
        return new Response(JSON.stringify([{ id: 290, status: 'picked_up', remarksJson: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.test.local/api/order/update_status/290') {
        return new Response(JSON.stringify({ success: true, action: 'complete' }), {
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
          id: 'cbq-290',
          data: callbackData,
          message: { chat: { id: 'chat-25' } },
        },
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      method: 'answerCallbackQuery',
      callback_query_id: 'cbq-290',
      text: '已送达',
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

      if (url === 'https://api.test.local/api/order/update_status/91') {
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
