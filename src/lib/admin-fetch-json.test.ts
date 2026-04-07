import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJSON } from './admin-fetch-json.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('fetchJSON retries GET once after 502 and returns recovered JSON payload', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input: string | URL | Request) => {
    calls.push(String(input instanceof Request ? input.url : input));
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: 'upstream_down' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([{ id: 589, orderType: 'delivery', status: 'awaiting_courier' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchJSON('https://api.test.local/api/admin/orders');

  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, [{ id: 589, orderType: 'delivery', status: 'awaiting_courier' }]);
});

test('fetchJSON retries GET once after invalid JSON body and returns recovered payload', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('<html>bad gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({ ok: true, data: [{ id: 590 }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchJSON('https://api.test.local/api/admin/orders');

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, [{ id: 590 }]);
});

test('fetchJSON does not retry non-GET 502 responses', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'bad_gateway' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchJSON('https://api.test.local/api/admin/settings/master', { method: 'POST' });

  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error, 'bad_gateway');
  assert.equal(result.errorDetail, '{"error":"bad_gateway"}');
  assert.deepEqual(result.data, { error: 'bad_gateway' });
});

test('fetchJSON preserves 503 response body for SSR diagnostics', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Database busy, please retry',
    code: 'backend_unavailable',
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await fetchJSON('https://api.test.local/api/admin/orders');

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, 'Database busy, please retry');
  assert.equal(result.code, 'backend_unavailable');
  assert.equal(result.errorDetail, '{"error":"Database busy, please retry","code":"backend_unavailable"}');
  assert.deepEqual(result.data, { error: 'Database busy, please retry', code: 'backend_unavailable' });
});
