import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMasterDispatchData } from './master-dispatch-loader.ts';

test('loadMasterDispatchData fallback consumes canonical impersonate/riders envelopes', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, init });

      if (url === 'http://local.test/api/master/dispatch') {
        return new Response(JSON.stringify({ awaiting: [], delivering: [], pools: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/master/impersonate-shop') {
        const headers = new Headers(init?.headers);
        assert.equal(init?.method, 'POST');
        assert.equal(headers.get('authorization'), 'Bearer master-token');
        assert.equal(headers.get('content-type'), 'application/json');
        assert.deepEqual(JSON.parse(String(init?.body || '{}')), { id: 11 });
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer master-token');
        return new Response(JSON.stringify({
          ok: true,
          data: {
            riders: [
              { id: 1, status: 'available' },
              { id: 2, status: 'busy' },
              { id: 3, status: 'offline' },
            ],
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterDispatchData({
      requestUrl: new URL('http://local.test/master?tab=dispatch'),
      authHeader: 'Bearer master-token',
      cookieHeader: 'master_token=abc',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.pools, [
      {
        shop_id: 11,
        shop_name: 'Shop 11',
        pool_count: 3,
        available_count: 1,
        busy_count: 1,
        offline_count: 1,
      },
    ]);
    assert.equal(calls.some((entry) => entry.url.includes('/api/master/impersonate-shop?id=')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterDispatchData fallback ignores legacy/raw impersonate response and keeps pools empty', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

      if (url === 'http://local.test/api/master/dispatch') {
        return new Response(JSON.stringify({ awaiting: [], delivering: [], pools: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/master/impersonate-shop') {
        return new Response(JSON.stringify({ token: 'legacy-admin-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/admin/riders') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            riders: [{ id: 1, status: 'available' }],
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterDispatchData({
      requestUrl: new URL('http://local.test/master?tab=dispatch'),
      authHeader: 'Bearer master-token',
      cookieHeader: '',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.pools, []);
    assert.equal(calls.includes('http://localhost:3030/api/admin/riders'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterDispatchData fallback ignores non-canonical riders payload', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/dispatch') {
        return new Response(JSON.stringify({ awaiting: [], delivering: [], pools: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/master/impersonate-shop') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://localhost:3030/api/admin/riders') {
        return new Response(JSON.stringify({ riders: [{ id: 1, status: 'available' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterDispatchData({
      requestUrl: new URL('http://local.test/master?tab=dispatch'),
      authHeader: 'Bearer master-token',
      cookieHeader: '',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.pools, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
