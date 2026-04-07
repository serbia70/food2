import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJsonWithSingleRetry } from './public-page-fetch.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('fetchJsonWithSingleRetry retries once after transient 502 and returns parsed JSON', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({ ok: true, data: { id: 103 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchJsonWithSingleRetry('http://api.test/103/info');

  assert.equal(calls, 2);
  assert.equal(result.response.ok, true);
  assert.deepEqual(result.data, { ok: true, data: { id: 103 } });
});

test('fetchJsonWithSingleRetry retries once after invalid JSON body and returns parsed JSON', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('<html>temporary edge page</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchJsonWithSingleRetry('http://api.test/103/menu');

  assert.equal(calls, 2);
  assert.equal(result.response.ok, true);
  assert.deepEqual(result.data, []);
});

test('fetchJsonWithSingleRetry does not hide final upstream failure after retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('bad gateway', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  };

  const result = await fetchJsonWithSingleRetry('http://api.test/103/info');

  assert.equal(calls, 2);
  assert.equal(result.response.status, 502);
  assert.equal(result.data, null);
});
