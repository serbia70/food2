import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/telegram/send.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST telegram send 读取店铺 settings 里的 token 并转发到 Telegram Bot API', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === 'http://localhost:3030/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({
          telegram: {
            token: 'bot-token-123',
            chat_id: '-10001',
          },
        }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botbot-token-123/sendMessage') {
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        chat_id: 'chat-7',
        text: '新订单',
        reply_markup: {
          inline_keyboard: [[{ text: '查看', url: 'https://food2.serbia70.com/rider/dashboard?orderId=1&restaurantId=21' }]],
        },
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_slug: 'demo-shop',
        chat_id: 'chat-7',
        text: '新订单',
        reply_markup: {
          inline_keyboard: [[{ text: '查看', url: 'https://food2.serbia70.com/rider/dashboard?orderId=1&restaurantId=21' }]],
        },
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 99 },
  });
  assert.ok(calls.some((call) => call.url === 'http://localhost:3030/demo-shop/info'));
  assert.ok(calls.some((call) => call.url === 'https://api.telegram.org/botbot-token-123/sendMessage'));
});

test('POST telegram send 在缺少 token 时返回 400', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'http://localhost:3030/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chat_id: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('https://food2.serbia70.com/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_slug: 'demo-shop',
        chat_id: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
  });
});
