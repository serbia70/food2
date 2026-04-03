import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'http://localhost:3030';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function loadRoute() {
  return import('../../../pages/api/rider/status.ts');
}

type CookieValue = { value: string };
type CookieJar = { get: (key: string) => CookieValue | undefined };

function makeCookies(values: Record<string, string | undefined>): CookieJar {
  return {
    get(key: string) {
      const value = values[key];
      return value ? { value } : undefined;
    },
  };
}

test('GET list_available 在无 admin auth 时直接返回 401', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://localhost:3030/api/admin/riders') {
        return new Response(JSON.stringify({ error: 'Authorization header required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const { GET } = await loadRoute();
    const response = await GET({
      request: new Request('http://localhost/api/rider/status?action=list_available'),
      cookies: makeCookies({}) as any,
      url: new URL('http://localhost/api/rider/status?action=list_available'),
    } as any);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Authorization header required' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rider status source uses server-safe API base url', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/rider/status.ts'), 'utf8');
  assert.match(source, /const apiBaseUrl = process\.env\.PUBLIC_API_URL \|\| API_BASE_URL;/);
  assert.match(source, /url: `\$\{apiBaseUrl\}\/api\/admin\/riders`,/);
  assert.match(source, /fetch\(`\$\{apiBaseUrl\}\/api\/rider\/status`, \{/);
  assert.match(source, /const upstreamBody = parsed && 'telegramChatId' in parsed/);
});

test('POST 在带 telegramChatId 空串时保留清空语义转发上游', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, 'http://localhost:3030/api/rider/status');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
        id: 7,
        riderPhone: '0613083899',
        status: 'available',
        telegram_chat_id: '',
        telegramChatId: '',
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const { POST } = await loadRoute();
    const response = await POST({
      request: new Request('http://localhost/api/rider/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 7,
          riderPhone: '0613083899',
          status: 'available',
          telegram_chat_id: '',
          telegramChatId: '',
        }),
      }),
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET list_available 在有 admin auth 时返回过滤后的 available riders', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://localhost:3030/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer admin-token');
        return new Response(JSON.stringify({
          riders: [
            { id: 1, name: 'A', phone: '061', status: 'available', telegramChatId: 'tg-1' },
            { id: 2, name: 'B', phone: '', status: 'available', telegramChatId: 'tg-2' },
            { id: 3, name: 'C', phone: '062', status: 'busy', telegramChatId: 'tg-3' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const { GET } = await loadRoute();
    const response = await GET({
      request: new Request('http://localhost/api/rider/status?action=list_available'),
      cookies: makeCookies({ admin_token: 'admin-token' }) as any,
      url: new URL('http://localhost/api/rider/status?action=list_available'),
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      riders: [
        { id: 1, name: 'A', phone: '061', status: 'available', telegramChatId: 'tg-1' },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET list_available 兼容 admin riders 返回 telegram_chat_id 并归一到 telegramChatId', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://localhost:3030/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer admin-token');
        return new Response(JSON.stringify({
          riders: [
            { id: 7, name: '陈工', phone: '0613083899', status: 'available', telegram_chat_id: 'chat-7' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const { GET } = await loadRoute();
    const response = await GET({
      request: new Request('http://localhost/api/rider/status?action=list_available'),
      cookies: makeCookies({ admin_token: 'admin-token' }) as any,
      url: new URL('http://localhost/api/rider/status?action=list_available'),
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      riders: [
        { id: 7, name: '陈工', phone: '0613083899', status: 'available', telegram_chat_id: 'chat-7', telegramChatId: 'chat-7' },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
