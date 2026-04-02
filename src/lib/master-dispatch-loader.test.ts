import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMasterDispatchData } from './master-dispatch-loader.ts';

test('loadMasterDispatchData retries once when dispatch proxy returns transient 502 html', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/dispatch') {
        attempts += 1;
        if (attempts === 1) {
          return new Response('<html><body>Bad Gateway</body></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response(JSON.stringify({
          ok: true,
          data: {
            awaiting: [{ id: 101, orderNo: 'A-101' }],
            delivering: [{ id: 202, orderNo: 'D-202' }],
            pools: [{ shopId: 11, poolCount: 3 }],
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

    assert.equal(attempts, 2);
    assert.equal(result.error, '');
    assert.deepEqual(result.payload.awaiting, [{ id: 101, order_no: 'A-101' }]);
    assert.deepEqual(result.payload.delivering, [{ id: 202, order_no: 'D-202' }]);
    assert.deepEqual(result.payload.pools, [{ shop_id: 11, pool_count: 3 }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterDispatchData unwraps canonical camelCase dispatch contract into page fields', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/dispatch') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            awaiting: [
              {
                id: 469,
                orderNo: '469',
                shopId: 21,
                shopName: 'Demo Shop',
                status: 'awaiting_courier',
                dispatch: {
                  status: 'idle',
                  dispatchRound: 0,
                  currentPoolIndex: 0,
                  lastDispatchedRiderID: 7,
                  nextEscalateAt: '2026-04-01T12:00:00Z',
                },
              },
            ],
            delivering: [
              {
                id: 470,
                orderNo: '470',
                shopId: 22,
                shopName: 'Live Shop',
                status: 'delivering',
                dispatch: {
                  status: 'claimed',
                  dispatchRound: 1,
                  currentPoolIndex: 1,
                  lastDispatchedRiderID: 8,
                  nextEscalateAt: '2026-04-01T12:05:00Z',
                },
              },
            ],
            pools: [
              {
                shopId: 21,
                shopName: 'Demo Shop',
                poolCount: 3,
                availableCount: 1,
                busyCount: 1,
                offlineCount: 1,
              },
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
      shopRows: [{ id: 21, name: 'Demo Shop' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.awaiting, [
      {
        id: 469,
        order_no: '469',
        shop_id: 21,
        shop_name: 'Demo Shop',
        status: 'awaiting_courier',
        dispatch_status: 'idle',
        dispatch_round: 0,
        current_pool_index: 0,
        last_dispatched_rider_id: 7,
        next_escalate_at: '2026-04-01T12:00:00Z',
      },
    ]);
    assert.deepEqual(result.payload.delivering, [
      {
        id: 470,
        order_no: '470',
        shop_id: 22,
        shop_name: 'Live Shop',
        status: 'delivering',
        dispatch_status: 'claimed',
        dispatch_round: 1,
        current_pool_index: 1,
        last_dispatched_rider_id: 8,
        next_escalate_at: '2026-04-01T12:05:00Z',
      },
    ]);
    assert.deepEqual(result.payload.pools, [
      {
        shop_id: 21,
        shop_name: 'Demo Shop',
        pool_count: 3,
        available_count: 1,
        busy_count: 1,
        offline_count: 1,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterDispatchData ignores legacy snake_case dispatch rows and pools', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/dispatch') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            awaiting: [{ id: 101, order_no: 'A-101', shop_id: 11, shop_name: 'Legacy Shop' }],
            delivering: [],
            pools: [{ shop_id: 11, shop_name: 'Legacy Shop', pool_count: 3 }],
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
      shopRows: [{ id: 11, name: 'Legacy Shop' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload.awaiting, [{ id: 101 }]);
    assert.deepEqual(result.payload.pools, [{}]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('loadMasterDispatchData keeps pools empty when backend dispatch payload has no pools', async () => {
  const originalFetch = globalThis.fetch;
  let dispatchCalls = 0;

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url === 'http://local.test/api/master/dispatch') {
        dispatchCalls += 1;
        return new Response(JSON.stringify({ ok: true, data: { awaiting: [], delivering: [], pools: [] } }), {
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

    assert.equal(dispatchCalls, 1);
    assert.equal(result.error, '');
    assert.deepEqual(result.payload.pools, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadMasterDispatchData ignores non-canonical dispatch response and returns empty payload', async () => {
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

      if (url === 'https://food2api.serbia70.com/api/master/impersonate-shop?id=11') {
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

      throw new Error(`unexpected fetch: ${url}`);
    };

    const result = await loadMasterDispatchData({
      requestUrl: new URL('http://local.test/master?tab=dispatch'),
      authHeader: 'Bearer master-token',
      cookieHeader: '',
      shopRows: [{ id: 11, name: 'Shop 11' }],
    });

    assert.equal(result.error, '');
    assert.deepEqual(result.payload, {
      awaiting: [],
      delivering: [],
      pools: [],
    });
    assert.equal(calls.includes('https://food2api.serbia70.com/api/master/impersonate-shop?id=11'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
