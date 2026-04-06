import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/master/telegram-webhook-info.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildConnectTimeoutError() {
  const error = new TypeError('fetch failed') as TypeError & { cause?: { message: string; code: string } };
  error.cause = {
    message: 'Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)',
    code: 'UND_ERR_CONNECT_TIMEOUT',
  };
  return error;
}

function buildCookies(hasMaster = true) {
  return {
    get(name: string) {
      if (hasMaster && name === 'master_token') return { value: 'test-master-token' };
      return undefined;
    },
  };
}

test('POST telegram-webhook-info 在未登录时返回 401', async () => {
  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/master/telegram-webhook-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    cookies: buildCookies(false),
  } as any);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Unauthorized',
    },
  });
});

test('POST telegram-webhook-info 从 master init 读取已保存 token 并返回 Telegram webhook 信息', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/api/master/init') {
      assert.equal(init?.method, 'GET');
      return new Response(JSON.stringify({
        ok: true,
        data: {
          settings: {
            telegram_bot_token: 'saved-bot-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botsaved-bot-token/getWebhookInfo') {
      return new Response(JSON.stringify({
        ok: true,
        result: {
          url: 'https://food2.serbia70.com/api/telegram/webhook',
          has_custom_certificate: false,
          pending_update_count: 0,
          last_error_date: 0,
          last_error_message: '',
          max_connections: 40,
          ip_address: '1.2.3.4',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/master/telegram-webhook-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=test-master-token',
      },
      body: '{}',
    }),
    cookies: buildCookies(true),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    tokenSource: 'saved',
    webhook: {
      url: 'https://food2.serbia70.com/api/telegram/webhook',
      has_custom_certificate: false,
      pending_update_count: 0,
      last_error_date: 0,
      last_error_message: '',
      max_connections: 40,
      ip_address: '1.2.3.4',
    },
  });
  assert.deepEqual(calls, [
    'https://api.test.local/api/master/init',
    'https://api.telegram.org/botsaved-bot-token/getWebhookInfo',
  ]);
});

test('POST telegram-webhook-info 在缺少 token 时返回明确错误', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/init') {
      return new Response(JSON.stringify({ ok: true, data: { settings: {} } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/master/telegram-webhook-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=test-master-token',
      },
      body: '{}',
    }),
    cookies: buildCookies(true),
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
  });
});

test('POST telegram-webhook-info 在 Telegram 超时时返回明确诊断', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/init') {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          settings: {
            telegram_bot_token: 'saved-bot-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://api.telegram.org/botsaved-bot-token/getWebhookInfo') {
      throw buildConnectTimeoutError();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/master/telegram-webhook-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=test-master-token',
      },
      body: '{}',
    }),
    cookies: buildCookies(true),
  } as any);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_webhook_info_fetch_failed',
    details: {
      code: 'UND_ERR_CONNECT_TIMEOUT',
      cause: 'Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)',
    },
  });
});
