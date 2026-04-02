import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMasterRiderStatusData } from './master-rider-status-loader.ts';

const REQUEST_URL = new URL('http://local.test/master?tab=riders');

test('loadMasterRiderStatusData uses one canonical impersonate token and a single riders fetch', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push({ url, init });

      if (url === 'http://local.test/api/master/impersonate-shop?id=11') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer master-token');
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            token: 'Bearer admin-token-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), 'Bearer admin-token-11');
        return new Response(JSON.stringify({
          success: true,
          riders: [
            { id: 1, name: 'A', phone: '111', status: 'available' },
            { id: 2, name: 'B', phone: '222', status: 'busy' },
            { id: 3, name: 'C', phone: '333', status: 'offline' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
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
    assert.equal(calls.filter((entry) => entry.url.startsWith('http://local.test/api/master/impersonate-shop')).length, 1);
    assert.equal(calls.filter((entry) => entry.url === 'http://local.test/api/admin/riders').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData accepts canonical admin riders payload', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url.startsWith('http://local.test/api/master/impersonate-shop')) {
        assert.equal(init?.method, 'GET');
        const parsed = new URL(url);
        const id = Number(parsed.searchParams.get('id') || 0);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: `shop-${id}`,
            token: `Bearer admin-token-${id}`,
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        const headers = new Headers(init?.headers);
        const latestId = Number(String(headers.get('authorization') || '').replace('Bearer admin-token-', '') || 0);
        if (latestId === 11) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              riders: [{ id: 1, name: 'Canonical Rider', status: 'available' }],
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
              riders: [{ id: 2, name: 'Canonical Busy Rider', status: 'busy' }],
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
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
      ],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 2,
      available_riders: 1,
      busy_riders: 1,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
    assert.equal(result.payload.groups.available[0].name, 'Canonical Rider');
    assert.equal(result.payload.groups.busy[0].name, 'Canonical Busy Rider');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData accepts rows and nested rows payload shapes from admin riders', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

      if (url.startsWith('http://local.test/api/master/impersonate-shop')) {
        assert.equal(init?.method, 'GET');
        const parsed = new URL(url);
        const id = Number(parsed.searchParams.get('id') || 0);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: `shop-${id}`,
            token: `Bearer admin-token-${id}`,
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        const headers = new Headers(init?.headers);
        const latestId = Number(String(headers.get('authorization') || '').replace('Bearer admin-token-', '') || 0);
        if (latestId === 11) {
          return new Response(JSON.stringify({
            success: true,
            rows: [{ id: 1, name: 'Rows Rider', status: 'available' }],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (latestId === 22) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              rows: [{ id: 2, name: 'Nested Rows Rider', status: 'busy' }],
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
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
      ],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 2,
      available_riders: 1,
      busy_riders: 1,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
    assert.equal(result.payload.groups.available[0].name, 'Rows Rider');
    assert.equal(result.payload.groups.busy[0].name, 'Nested Rows Rider');
    assert.equal(calls.filter((entry) => entry === 'http://local.test/api/admin/riders').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('loadMasterRiderStatusData skips shop when impersonate response is non-canonical', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

      if (url === 'http://local.test/api/master/impersonate-shop?id=11') {
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          success: true,
          slug: 'shop-11',
          token: 'legacy-admin-token',
          impersonated: true,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        return new Response(JSON.stringify({
          success: true,
          riders: [{ id: 1, name: 'should-not-load', status: 'available' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
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
    assert.equal(calls.includes('http://local.test/api/admin/riders'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData returns stable empty payload when master auth is missing', async () => {
  const result = await loadMasterRiderStatusData({
    requestUrl: REQUEST_URL,
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

test('loadMasterRiderStatusData does not collapse distinct riders when id/name/phone are all missing', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

      if (url.startsWith('http://local.test/api/master/impersonate-shop')) {
        assert.equal(init?.method, 'GET');
        const parsed = new URL(url);
        const id = Number(parsed.searchParams.get('id') || 0);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: `shop-${id}`,
            token: `Bearer admin-token-${id}`,
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        const headers = new Headers(init?.headers);
        const latestId = Number(String(headers.get('authorization') || '').replace('Bearer admin-token-', '') || 0);

        if (latestId === 11) {
          return new Response(JSON.stringify({
            success: true,
            riders: [{ status: 'available' }],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (latestId === 22) {
          return new Response(JSON.stringify({
            success: true,
            riders: [{ status: 'busy' }],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
      ],
    });

    assert.equal(result.error, '');
    assert.equal(result.payload.summary.total_riders, 2);
    assert.equal(result.payload.summary.available_riders, 1);
    assert.equal(result.payload.summary.busy_riders, 1);
    assert.equal(result.payload.summary.offline_riders, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData continues when one shop riders request fails', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);

      if (url.startsWith('http://local.test/api/master/impersonate-shop')) {
        assert.equal(init?.method, 'GET');
        const parsed = new URL(url);
        const id = Number(parsed.searchParams.get('id') || 0);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: `shop-${id}`,
            token: `Bearer admin-token-${id}`,
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        const headers = new Headers(init?.headers);
        const latestId = Number(String(headers.get('authorization') || '').replace('Bearer admin-token-', '') || 0);
        if (latestId === 11) {
          throw new Error('backend 502');
        }
        if (latestId === 22) {
          return new Response(JSON.stringify({
            success: true,
            riders: [{ id: 2, name: 'Backup Rider', status: 'busy' }],
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
      ],
    });

    assert.equal(result.error, '');
    assert.equal(result.payload.summary.total_riders, 0);
    assert.equal(result.payload.summary.busy_riders, 0);
    assert.deepEqual(result.payload.groups.busy, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData limits shop impersonation fan-out to small batches', async () => {
  const originalFetch = globalThis.fetch;
  const startedShopIds: number[] = [];
  let releaseFirstRequest: (() => void) | null = null;
  const firstRequestGate = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });
  let sawThirdStartBeforeRelease = false;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url.startsWith('http://local.test/api/master/impersonate-shop')) {
        assert.equal(init?.method, 'GET');
        const id = Number(new URL(url).searchParams.get('id') || 0);
        startedShopIds.push(id);
        if (startedShopIds.length === 1) {
          await firstRequestGate;
        }
        if (startedShopIds.length >= 3) {
          sawThirdStartBeforeRelease = true;
        }
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: `shop-${id}`,
            token: `Bearer admin-token-${id}`,
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        return new Response(JSON.stringify({ success: true, riders: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const loadPromise = loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [
        { id: 11, name: 'Shop 11' },
        { id: 22, name: 'Shop 22' },
        { id: 33, name: 'Shop 33' },
      ],
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sawThirdStartBeforeRelease, false);
    releaseFirstRequest?.();
    await loadPromise;
    assert.deepEqual(startedShopIds, [11, 22, 33]);
  } finally {
    releaseFirstRequest?.();
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData retries transient riders request failure before dropping shop data', async () => {
  const originalFetch = globalThis.fetch;
  let ridersAttempts = 0;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/impersonate-shop?id=11') {
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            token: 'Bearer admin-token-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        ridersAttempts += 1;
        if (ridersAttempts === 1) {
          throw new Error('temporary 502');
        }
        return new Response(JSON.stringify({
          success: true,
          riders: [{ id: 1, name: 'Recovered Rider', status: 'available' }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(ridersAttempts, 2);
    assert.equal(result.error, '');
    assert.equal(result.payload.summary.total_riders, 1);
    assert.equal(result.payload.groups.available[0].name, 'Recovered Rider');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterRiderStatusData filters non-object rider entries in success/riders payload', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/impersonate-shop?id=11') {
        assert.equal(init?.method, 'GET');
        return new Response(JSON.stringify({
          ok: true,
          data: {
            slug: 'shop-11',
            token: 'Bearer admin-token-11',
            impersonated: true,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://local.test/api/admin/riders') {
        return new Response(JSON.stringify({
          success: true,
          riders: [
            null,
            'dirty-string',
            42,
            { id: 1, name: 'Valid Rider', status: 'available' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterRiderStatusData({
      requestUrl: REQUEST_URL,
      authHeader: 'Bearer master-token',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.summary, {
      total_riders: 1,
      available_riders: 1,
      busy_riders: 0,
      offline_riders: 0,
      active_order_count: 0,
      cod_order_count: 0,
      delivery_fee_total: 0,
      cod_amount_total: 0,
    });
    assert.equal(result.payload.groups.available.length, 1);
    assert.equal(result.payload.groups.available[0].name, 'Valid Rider');
    assert.deepEqual(result.payload.groups.busy, []);
    assert.deepEqual(result.payload.groups.offline, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
