import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMasterRiderStatusData } from './master-rider-status-loader.ts';

test('loadMasterRiderStatusData aggregates and de-duplicates riders from canonical impersonate/riders envelopes', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, init });

      if (url === 'http://localhost:3030/api/master/impersonate-shop') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer master-token');
        assert.equal(init?.method, 'POST');
        assert.equal(headers.get('content-type'), 'application/json');
        const body = JSON.parse(String(init?.body || '{}')) as { id?: number };
        const id = Number(body.id || 0);

        if (id === 11 || id === 22) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              slug: `shop-${id}`,
              impersonated: true,
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (url === 'http://localhost:3030/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer master-token');

        const impersonateCalls = calls.filter((entry) => entry.url === 'http://localhost:3030/api/master/impersonate-shop');
        const latest = impersonateCalls[impersonateCalls.length - 1];
        const latestId = Number(JSON.parse(String(latest?.init?.body || '{}')).id || 0);

        if (latestId === 11) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              riders: [
                { id: 1, name: 'A', phone: '111', status: 'available' },
                { id: 2, name: 'B', phone: '222', status: 'busy' },
              ],
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (latestId === 22) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              riders: [
                { id: 1, name: 'A', phone: '111', status: 'available' },
                { id: 3, name: 'C', phone: '333', status: 'offline' },
              ],
            },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
      ],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 3,
      available_riders: 1,
      busy_riders: 1,
      offline_riders: 1,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
    assert.equal(result.payload.groups.available.length, 1);
    assert.equal(result.payload.groups.available[0].name, 'A');
    assert.equal(result.payload.groups.busy[0].name, 'B');
    assert.equal(result.payload.groups.offline[0].name, 'C');

    assert.equal(calls.some((entry) => entry.url.includes('/api/master/impersonate-shop?id=')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData ignores legacy/raw impersonate response and keeps groups/summary empty', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

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
            riders: [{ id: 1, name: 'should-not-be-consumed', status: 'available' }],
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 0,
      available_riders: 0,
      busy_riders: 0,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
    assert.deepEqual(result.payload.groups, {
      available: [],
      busy: [],
      offline: [],
    });
    assert.equal(calls.includes('http://localhost:3030/api/admin/riders'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData ignores non-canonical riders payload instead of reading legacy rows/items', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

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
        return new Response(JSON.stringify({
          rows: [{ id: 1, name: 'legacy-row-rider', status: 'available' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 0,
      available_riders: 0,
      busy_riders: 0,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData returns stable empty payload when master auth is missing', async () => {
  const result = await loadMasterRiderStatusData({
    authHeader: '',
    shopRows: [{ id: 11, name: 'Shop 11' }],
  });

  assert.deepEqual(result.payload, {
    summary: {
      total_riders: 0,
      available_riders: 0,
      busy_riders: 0,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    },
    groups: {
      available: [],
      busy: [],
      offline: [],
    },
  });
  assert.equal(result.error, '');
});
