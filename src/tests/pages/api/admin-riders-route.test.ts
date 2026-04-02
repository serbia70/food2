import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../../../pages/api/admin/riders.ts';

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

test('GET /api/admin/riders proxies admin auth to upstream riders endpoint', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, 'https://food2api.serbia70.com/api/admin/riders');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer admin-token');

      return new Response(JSON.stringify({ success: true, riders: [{ id: 1, status: 'available' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const response = await GET({
      request: new Request('http://localhost/api/admin/riders'),
      cookies: makeCookies({ admin_token: 'admin-token' }) as any,
    } as any);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, riders: [{ id: 1, status: 'available' }] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
