import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('./telegram-test.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  return {
    get(name: string) {
      if (name === 'master_token') return { value: 'master-token-1' };
      return undefined;
    },
  };
}

test('returns telegram_bot_token_not_configured when body and saved settings both miss token', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: '-1001', telegramBotToken: '' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: '', telegramChatId: '' }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
  });
});

test('returns telegram_chat_id_required when resolved chat id is empty', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: '', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: '', telegramChatId: '' }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_chat_id_required',
  });
});

test('sends telegram message through backend telegram endpoint with request body values before saved settings fallback', async () => {
  let upstreamRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/telegram-test') {
      upstreamRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 555 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: 'saved-chat-id', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
        text: 'Master Telegram 测试消息',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 555 },
  });
  assert.deepEqual(upstreamRequest, {
    url: 'https://api.test.local/api/master/telegram-test',
    body: {
      telegramBotToken: 'inline-token',
      telegramChatId: '-100998877',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('accepts snake_case body keys before saved settings fallback', async () => {
  let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/telegram-test') {
      telegramRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 777 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_bot_token: 'inline-token',
        telegram_chat_id: '-100998877',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 777 },
  });
  assert.deepEqual(telegramRequest, {
    url: 'https://api.test.local/api/master/telegram-test',
    body: {
      telegramBotToken: 'inline-token',
      telegramChatId: '-100998877',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('sends telegram message when body is complete even if settings fetch would fail', async () => {
  let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/telegram-test') {
      telegramRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 778 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 778 },
  });
  assert.deepEqual(telegramRequest, {
    url: 'https://api.test.local/api/master/telegram-test',
    body: {
      telegramBotToken: 'inline-token',
      telegramChatId: '-100998877',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('falls back to saved chat id when body only provides token', async () => {
  let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: '-100saved-chat' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/master/telegram-test') {
      telegramRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 779 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 779 },
  });
  assert.deepEqual(telegramRequest, {
    url: 'https://api.test.local/api/master/telegram-test',
    body: {
      telegramBotToken: 'inline-token',
      telegramChatId: '-100saved-chat',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('falls back to saved snake_case token when body only provides chat id', async () => {
  let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegram_bot_token: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/master/telegram-test') {
      telegramRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 780 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: '',
        telegramChatId: '-100998877',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 780 },
  });
  assert.deepEqual(telegramRequest, {
    url: 'https://api.test.local/api/master/telegram-test',
    body: {
      telegramBotToken: 'saved-bot-token',
      telegramChatId: '-100998877',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('returns structured telegram_send_failed payload when telegram api rejects request', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/telegram-test') {
      return new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: 'saved-chat-id', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
        text: 'Master Telegram 测试消息',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    description: 'Bad Request: chat not found',
  });
});

test('returns invalid_json when request body is not valid json', async () => {
  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'invalid_json',
  });
});

test('returns network error message when telegram fetch throws', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: 'saved-chat-id', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://api.test.local/api/master/telegram-test') {
      throw new Error('telegram network down');
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: '',
        telegramChatId: '',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'backend_unavailable',
      message: 'Backend unavailable',
    },
  });
});

test('returns nested cause when telegram fetch fails with generic fetch failed', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.test.local/api/master/telegram-test') {
      throw new Error('fetch failed', { cause: new Error('Client network socket disconnected before secure TLS connection was established') });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'backend_connection_closed',
      message: 'Backend connection closed unexpectedly',
    },
  });
});

test('rejects request when master auth is missing', async () => {
  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
      }),
    }),
    cookies: {
      get() {
        return undefined;
      },
    },
  } as never);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Unauthorized',
    },
  });
});
