import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../../../pages/api/rider/status.ts';

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
            { id: 1, name: 'A', phone: '061', status: 'available', telegram_chat_id: 'tg-1' },
            { id: 2, name: 'B', phone: '', status: 'available', telegram_chat_id: 'tg-2' },
            { id: 3, name: 'C', phone: '062', status: 'busy', telegram_chat_id: 'tg-3' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const response = await GET({
      request: new Request('http://localhost/api/rider/status?action=list_available'),
      cookies: makeCookies({ admin_token: 'admin-token' }) as any,
      url: new URL('http://localhost/api/rider/status?action=list_available'),
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      riders: [
        { id: 1, name: 'A', phone: '061', status: 'available', telegram_chat_id: 'tg-1' },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
