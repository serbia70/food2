process.env.PUBLIC_API_URL = 'http://localhost:3030';
process.env.TELEGRAM_CALLBACK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-callback-secret';
process.env.TELEGRAM_BIND_SECRET = 'test-telegram-bind-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRiderTelegramBindToken } from '../../../lib/telegram-rider-bind.ts';
import { POST } from '../../../pages/api/telegram/rider-bind.ts';

test('POST rider-bind 在 secret 错误时返回 401', async () => {
  const request = new Request('http://localhost/api/telegram/rider-bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    body: JSON.stringify({
      bindToken: 'ignored',
      chatId: 'chat-7',
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'unauthorized_telegram_request',
  });
});

test('POST rider-bind 在 token 非法时返回统一错误码 400', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error('upstream should not be called');
    };

    const request = new Request('http://localhost/api/telegram/rider-bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        bindToken: 'bad.token',
        chatId: 'chat-7',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'invalid_bind_token',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST rider-bind 在 token 过期时返回 400', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error('upstream should not be called');
    };

    const bindToken = buildRiderTelegramBindToken({
      riderId: 7,
      riderPhone: '0613083899',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }, 'test-telegram-bind-secret');

    const request = new Request('http://localhost/api/telegram/rider-bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        bindToken: bindToken,
        chatId: 'chat-7',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'bind_token_expired',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST rider-bind 在请求缺字段时返回 400', async () => {
  const request = new Request('http://localhost/api/telegram/rider-bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
    },
    body: JSON.stringify({
      chatId: 'chat-7',
    }),
  });

  const response = await POST({ request } as any);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'invalid_bind_request',
  });
});

test('POST rider-bind 在签名合法时写回 telegram_chat_id', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const bindToken = buildRiderTelegramBindToken({
      riderId: 7,
      riderPhone: '0613083899',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, 'test-telegram-bind-secret');

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, 'http://localhost:3030/api/rider/status');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        id: 7,
        telegram_chat_id: 'chat-7',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const request = new Request('http://localhost/api/telegram/rider-bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'test-telegram-callback-secret',
      },
      body: JSON.stringify({
        bindToken: bindToken,
        chatId: 'chat-7',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rider-bind source uses canonical internal request fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/telegram/rider-bind.ts'), 'utf8');

  assert.match(source, /function readApiBaseUrl\(\): string \{/);
  assert.match(source, /const token = String\(\(body as Record<string, unknown>\)\?\.bindToken \|\| ''\)\.trim\(\);/);
  assert.match(source, /const chatId = String\(\(body as Record<string, unknown>\)\?\.chatId \|\| ''\)\.trim\(\);/);
  assert.doesNotMatch(source, /\.bind_token/);
  assert.doesNotMatch(source, /\.chat_id/);
});
