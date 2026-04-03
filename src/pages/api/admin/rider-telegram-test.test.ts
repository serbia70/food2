import assert from 'node:assert/strict';
import test from 'node:test';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('./rider-telegram-test.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider-telegram-test sends message to rider chat id through local telegram route', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderName: '陈工',
        riderChatId: 'chat-123',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, 'http://localhost:3000/api/telegram/send');

  const forwardedBody = JSON.parse(String(fetchCalls[0]?.init?.body ?? '{}')) as Record<string, string>;
  assert.equal(forwardedBody.shopSlug, 'demo-shop');
  assert.equal(forwardedBody.chat_id, 'chat-123');
  assert.match(forwardedBody.text, /陈工/);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, ok: true });
});

test('POST rider-telegram-test forwards inline telegramBotToken to avoid master-only fallback', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: '103',
        riderName: '陈工',
        riderChatId: '1329103975',
        telegramBotToken: 'inline-bot-token',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  const forwardedBody = JSON.parse(String(fetchCalls[0]?.init?.body ?? '{}')) as Record<string, string>;
  assert.equal(forwardedBody.telegramBotToken, 'inline-bot-token');
  assert.equal(response.status, 200);
});

test('POST rider-telegram-test forwards rider request to telegram send without local token lookup', async () => {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({ url, init });

    if (url === 'http://localhost:3000/api/telegram/send') {
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: '103',
        riderName: '陈工',
        riderChatId: '1329103975',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.url, 'http://localhost:3000/api/telegram/send');

  const forwardedBody = JSON.parse(String(fetchCalls[0]?.init?.body ?? '{}')) as Record<string, string>;
  assert.equal(forwardedBody.shopSlug, '103');
  assert.equal(forwardedBody.chat_id, '1329103975');
  assert.equal('telegramBotToken' in forwardedBody, false);
  assert.equal(response.status, 200);
});

test('POST rider-telegram-test bubbles telegram send token diagnostics directly', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === 'http://localhost:3000/api/telegram/send') {
      return new Response(JSON.stringify({
        success: false,
        error: 'telegram_bot_token_not_configured',
        tokenSource: 'missing_after_admin_and_home_fallback',
        diagnostics: {
          adminSettingsMaster: {
            status: 200,
            hasSettings: false,
            hasDataSettings: false,
            tokenFound: false,
          },
          homeSettings: {
            status: 200,
            hasSettings: false,
            hasDataSettings: true,
            tokenFound: false,
          },
        },
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: '103',
        riderName: '陈工',
        riderChatId: '1329103975',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
    tokenSource: 'missing_after_admin_and_home_fallback',
    diagnostics: {
      adminSettingsMaster: {
        status: 200,
        hasSettings: false,
        hasDataSettings: false,
        tokenFound: false,
      },
      homeSettings: {
        status: 200,
        hasSettings: false,
        hasDataSettings: true,
        tokenFound: false,
      },
    },
  });
});

test('POST rider-telegram-test rejects empty rider chat id', async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderName: '陈工',
        riderChatId: '   ',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_chat_id_missing',
  });
});

test('POST rider-telegram-test returns 502 when telegram send fetch throws', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderName: '陈工',
        riderChatId: 'chat-123',
      }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token-1' };
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_test_failed',
  });
});

test('POST rider-telegram-test returns 401 without admin auth', async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderName: '陈工',
        riderChatId: 'chat-123',
      }),
    }),
    cookies: {
      get() {
        return undefined;
      },
    },
  } as any);

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'unauthorized',
  });
});
