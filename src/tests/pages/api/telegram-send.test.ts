import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';

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

    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({
          telegram: {
            token: 'bot-token-123',
            chatId: '-10001',
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
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
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
  assert.ok(calls.some((call) => call.url === 'https://api.test.local/demo-shop/info'));
  assert.ok(calls.some((call) => call.url === 'https://api.telegram.org/botbot-token-123/sendMessage'));
});

test('POST telegram send 在店铺未配置 token 时回退读取当前站内 master settings 的全局 token', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/master/init') {
      assert.equal(init?.method, 'GET');
      return new Response(JSON.stringify({
        success: true,
        data: {
          settings: {
            telegram_bot_token: 'master-bot-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botmaster-bot-token/sendMessage') {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 } }), {
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
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 100 },
  });
  assert.ok(calls.includes('https://food2.serbia70.com/api/master/init'));
  assert.ok(calls.includes('https://api.telegram.org/botmaster-bot-token/sendMessage'));
});

test('POST telegram send 兼容 master settings 的 server.telegramBotToken 嵌套结构', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/master/init') {
      return new Response(JSON.stringify({
        success: true,
        data: {
          settings: {
            server: {
              telegramBotToken: 'nested-master-bot-token',
            },
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botnested-master-bot-token/sendMessage') {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 102 } }), {
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
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 102 },
  });
  assert.ok(calls.includes('https://food2.serbia70.com/api/master/init'));
  assert.ok(calls.includes('https://api.telegram.org/botnested-master-bot-token/sendMessage'));
});

test('POST telegram send 在店铺和 master 都缺少 token 时返回 400 与诊断信息', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://food2.serbia70.com/api/master/init') {
      return new Response(JSON.stringify({ success: true, data: { settings: {} } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://api.test.local/api/home') {
      return new Response(JSON.stringify({ data: { settings: {} } }), {
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
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
    tokenSource: 'missing_after_shop_master_home_fallback',
    diagnostics: {
      shopInfo: {
        requested: true,
        tokenFound: false,
      },
      masterSettings: {
        requested: true,
        status: 200,
        tokenFound: false,
      },
      homeSettings: {
        requested: true,
        status: 200,
        tokenFound: false,
      },
    },
  });
});

test('POST telegram send 请求当前站内 master init 时只透传 cookie', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/master/init') {
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.cookie, 'master_token=master-cookie-1; admin_token=admin-cookie-1');
      assert.equal(headers?.authorization, undefined);
      return new Response(JSON.stringify({
        success: true,
        data: {
          settings: {
            telegramBotToken: 'master-cookie-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botmaster-cookie-token/sendMessage') {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 103 } }), {
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
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=master-cookie-1; admin_token=admin-cookie-1',
        authorization: 'Bearer inline-auth-token',
      },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 103 },
  });
  assert.ok(calls.includes('https://food2.serbia70.com/api/master/init'));
  assert.ok(calls.includes('https://api.telegram.org/botmaster-cookie-token/sendMessage'));
});

test('POST telegram send 在当前站内 master settings 未授权时回退公开 home settings 的全局 token', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/demo-shop/info') {
      return new Response(JSON.stringify({
        id: 21,
        slug: 'demo-shop',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/master/init') {
      return new Response(JSON.stringify({
        ok: false,
        error: { code: 'unauthorized', message: 'Unauthorized' },
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.test.local/api/home') {
      return new Response(JSON.stringify({
        data: {
          settings: {
            telegramBotToken: 'public-home-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botpublic-home-token/sendMessage') {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 104 } }), {
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
        shopSlug: 'demo-shop',
        chatId: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 104 },
  });
  assert.ok(calls.includes('https://food2.serbia70.com/api/master/init'));
  assert.ok(calls.includes('https://api.test.local/api/home'));
  assert.ok(calls.includes('https://api.telegram.org/botpublic-home-token/sendMessage'));
});

test('POST telegram send 请求当前站内 master init 时不会转发 admin authorization', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/103/info') {
      return new Response(JSON.stringify({
        id: 103,
        slug: '103',
        settings: JSON.stringify({ telegram: { chatId: '-10001' } }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://food2.serbia70.com/api/master/init') {
      const headers = init?.headers as Record<string, string> | undefined;
      assert.equal(headers?.authorization, undefined);
      assert.equal(headers?.cookie, undefined);
      return new Response(JSON.stringify({
        ok: false,
        error: { code: 'unauthorized', message: 'Unauthorized' },
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.test.local/api/home') {
      return new Response(JSON.stringify({
        data: {
          settings: {
            telegramBotToken: 'public-home-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botpublic-home-token/sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 106 } }), {
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
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer admin-only-token',
      },
      body: JSON.stringify({
        shopSlug: '103',
        chat_id: '1329103975',
        text: 'Admin 骑手 Telegram 测试',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 106 },
  });
  assert.ok(calls.includes('https://food2.serbia70.com/api/master/init'));
  assert.ok(calls.includes('https://api.telegram.org/botpublic-home-token/sendMessage'));
});

test('POST telegram send 在缺少 shopSlug 时仍可使用全局 token 发送', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://food2.serbia70.com/api/master/init') {
      return new Response(JSON.stringify({
        success: true,
        data: {
          settings: {
            telegramBotToken: 'master-only-token',
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botmaster-only-token/sendMessage') {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.chat_id, 'chat-7');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), {
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
        chat_id: 'chat-7',
        text: '新订单',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 101 },
  });
  assert.ok(!calls.includes('https://api.test.local/demo-shop/info'));
});

test('POST telegram send 在店铺 settings 使用扁平 telegramBotToken 时也能发送', async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url === 'https://api.test.local/103/info') {
      return new Response(JSON.stringify({
        id: 103,
        slug: '103',
        settings: JSON.stringify({
          telegramBotToken: 'shop-flat-token',
          telegramChatId: '-10001',
        }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://api.telegram.org/botshop-flat-token/sendMessage') {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.chat_id, '1329103975');
      assert.equal(body.text, 'Admin 骑手 Telegram 测试');
      return new Response(JSON.stringify({ ok: true, result: { message_id: 105 } }), {
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
        shopSlug: '103',
        chat_id: '1329103975',
        text: 'Admin 骑手 Telegram 测试',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 105 },
  });
  assert.ok(calls.includes('https://api.test.local/103/info'));
  assert.ok(calls.includes('https://api.telegram.org/botshop-flat-token/sendMessage'));
  assert.ok(!calls.includes('https://food2.serbia70.com/api/master/init'));
});

test('POST telegram send 兼容 chat_id 字段', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === 'https://api.test.local/demo-shop/info') {
        return new Response(JSON.stringify({
          id: 21,
          slug: 'demo-shop',
          settings: JSON.stringify({ telegram: { token: 'bot-token-123' } }),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.telegram.org/botbot-token-123/sendMessage') {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.chat_id, 'chat-7');
        return new Response(JSON.stringify({ ok: true, result: { message_id: 102 } }), {
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
          shopSlug: 'demo-shop',
          chat_id: 'chat-7',
          text: '新订单',
        }),
      }),
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      ok: true,
      result: { message_id: 102 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST telegram send 兼容 shop_slug 字段', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === 'https://api.test.local/demo-shop/info') {
        return new Response(JSON.stringify({
          id: 21,
          slug: 'demo-shop',
          settings: JSON.stringify({ telegram: { token: 'bot-token-123' } }),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.telegram.org/botbot-token-123/sendMessage') {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.chat_id, 'chat-7');
        assert.equal(body.text, '新订单');
        return new Response(JSON.stringify({ ok: true, result: { message_id: 107 } }), {
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

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      ok: true,
      result: { message_id: 107 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST telegram send retries through multiple connect timeouts and then succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let telegramAttempts = 0;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://api.test.local/demo-shop/info') {
        return new Response(JSON.stringify({
          id: 21,
          slug: 'demo-shop',
          settings: JSON.stringify({ telegram: { token: 'bot-token-123' } }),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.telegram.org/botbot-token-123/sendMessage') {
        telegramAttempts += 1;
        if (telegramAttempts < 2) {
          throw Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error('Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)'), {
              code: 'UND_ERR_CONNECT_TIMEOUT',
            }),
          });
        }
        return new Response(JSON.stringify({ ok: true, result: { message_id: 108 } }), {
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
          shopSlug: 'demo-shop',
          chat_id: 'chat-7',
          text: '新订单',
        }),
      }),
    } as any);

    assert.equal(response.status, 200);
    assert.equal(telegramAttempts, 2);
    assert.deepEqual(await response.json(), {
      success: true,
      ok: true,
      result: { message_id: 108 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST telegram send returns 502 after exhausting connect timeout retries', async () => {
  const originalFetch = globalThis.fetch;
  let telegramAttempts = 0;

  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://api.test.local/demo-shop/info') {
        return new Response(JSON.stringify({
          id: 21,
          slug: 'demo-shop',
          settings: JSON.stringify({ telegram: { token: 'bot-token-123' } }),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.telegram.org/botbot-token-123/sendMessage') {
        telegramAttempts += 1;
        throw Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)'), {
            code: 'UND_ERR_CONNECT_TIMEOUT',
          }),
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
          shopSlug: 'demo-shop',
          chat_id: 'chat-7',
          text: '新订单',
        }),
      }),
    } as any);

    assert.equal(response.status, 502);
    assert.equal(telegramAttempts, 2);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'telegram_send_failed',
      message: 'fetch failed',
      cause: 'Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)',
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('telegram send source uses canonical internal request fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/telegram/send.ts'), 'utf8');

  assert.match(source, /shopSlug\?: unknown;/);
  assert.match(source, /chatId\?: unknown;/);
  assert.match(source, /chat_id\?: unknown;/);
  assert.match(source, /function readTelegramBotToken\(raw: unknown\): string \{/);
  assert.match(source, /const masterHeaders: Record<string, string> = \{\};/);
  assert.match(source, /const cookie = request\.headers\.get\('cookie'\) \|\| '';/);
  assert.match(source, /if \(cookie\) masterHeaders\.cookie = cookie;/);
  assert.match(source, /const TELEGRAM_SEND_MAX_ATTEMPTS = 2;/);
  assert.match(source, /const TELEGRAM_SEND_RETRY_DELAY_MS = 250;/);
  assert.match(source, /const TELEGRAM_SEND_REQUEST_TIMEOUT_MS = 12000;/);
  assert.match(source, /await wait\(TELEGRAM_SEND_RETRY_DELAY_MS \* attempt\);/);
  assert.doesNotMatch(source, /const authorization = request\.headers\.get\('authorization'\) \|\| '';/);
  assert.doesNotMatch(source, /passthroughHeaders\.authorization = authorization/);
  assert.match(source, /const normalizedShopSlug = String\(shopSlug \|\| ''\)\.trim\(\);/);
  assert.match(source, /const shopSlug = String\(body\.shopSlug \|\| body\.shop_slug \|\| ''\)\.trim\(\);/);
  assert.match(source, /const chatId = String\(body\.chatId \|\| body\.chat_id \|\| ''\)\.trim\(\);/);
  assert.match(source, /const homeRes = await fetch\(`\$\{API_BASE_URL\}\/api\/home`\);/);
  assert.match(source, /shop_slug\?: unknown;/);
  assert.match(source, /body\.shop_slug/);
});
