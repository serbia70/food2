import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/admin/rider-telegram-test.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildCookies() {
  return {
    get(name: string) {
      if (name === 'admin_token') return { value: 'test-admin-token' };
      return undefined;
    },
  };
}

test('POST rider-telegram-test 走后端 telegram send 并透传鉴权头', async () => {
  let upstreamBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === 'https://api.test.local/api/telegram/send') {
      const headers = new Headers(init?.headers);
      upstreamBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      assert.equal(headers.get('cookie'), 'master_token=master-cookie-1; admin_token=admin-cookie-1');
      assert.equal(headers.get('authorization'), 'Bearer inline-auth-token');
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 101 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=master-cookie-1; admin_token=admin-cookie-1',
        authorization: 'Bearer inline-auth-token',
      },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderChatId: 'chat-7',
        riderName: '骑手A',
        telegramBotToken: 'inline-bot-token',
      }),
    }),
    cookies: buildCookies(),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 101 },
  });
  assert.equal(upstreamBody?.shop_slug, 'demo-shop');
  assert.equal(upstreamBody?.chat_id, 'chat-7');
  assert.equal(upstreamBody?.telegramBotToken, 'inline-bot-token');
  assert.match(String(upstreamBody?.text || ''), /Admin 骑手 Telegram 测试/);
});

test('POST rider-telegram-test 在上游异常时返回真实错误信息', async () => {
  globalThis.fetch = (async () => {
    throw new Error('backend telegram route offline');
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'admin_token=test-admin-token',
      },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderChatId: 'chat-7',
      }),
    }),
    cookies: buildCookies(),
  } as any);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_test_failed',
    message: 'backend telegram route offline',
  });
});
