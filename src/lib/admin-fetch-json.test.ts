import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJSON } from './admin-fetch-json.ts';

test('fetchJSON: ok response parses JSON and merges cache headers', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await fetchJSON('http://example.test/data', {
      headers: { 'X-Test': '1' },
    });

    assert.deepEqual(result, { ok: true, status: 200, data: { ok: true } });
    assert.ok(capturedInit, 'expected fetch to be called');
    assert.equal(capturedInit!.cache, 'no-store');
    const headers = capturedInit!.headers as Record<string, string>;
    assert.equal(headers['X-Test'], '1');
    assert.equal(headers['Cache-Control'], 'no-cache');
    assert.equal(headers.Pragma, 'no-cache');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJSON: ok response with non-JSON text returns null data', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });

    const result = await fetchJSON('http://example.test/text');

    assert.deepEqual(result, { ok: true, status: 200, data: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJSON: ok response unwraps canonical envelope data payload', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        ok: true,
        data: { id: 101, slug: '101' },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await fetchJSON('http://example.test/canonical');

    assert.deepEqual(result, { ok: true, status: 200, data: { id: 101, slug: '101' } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJSON: fetch throws returns 503', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error('boom');
    };

    const result = await fetchJSON('http://example.test/fail');

    assert.deepEqual(result, { ok: false, status: 503, data: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
