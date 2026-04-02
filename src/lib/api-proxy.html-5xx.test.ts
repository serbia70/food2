import test from 'node:test';
import assert from 'node:assert/strict';

import { proxyFetch } from './api-proxy.ts';

test('proxyFetch: wraps upstream 5xx HTML into JSON (prevents browser JSON.parse errors)', async () => {
  const upstreamUrl = 'https://upstream.example.test/x';

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any) => {
      assert.equal(String(url), upstreamUrl);
      const html = '<!DOCTYPE html><html><body>Bad Gateway</body></html>';
      return new Response(html, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };

    const res = await proxyFetch(upstreamUrl, { method: 'GET' }, 5000);
    const text = await res.text();

    assert.equal(res.status, 502);
    assert.ok((res.headers.get('content-type') || '').includes('application/json'));

    const data = JSON.parse(text);
    assert.equal(data?.ok, false);
    assert.deepEqual(data?.error, {
      code: 'upstream_non_json',
      message: 'Upstream error (502)',
      details: { upstreamStatus: 502 },
    });
    assert.equal(Object.hasOwn(data, 'success'), false);
    assert.equal(Object.hasOwn(data, 'code'), false);
    assert.equal(Object.hasOwn(data, 'upstreamStatus'), false);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyFetch: retries one time on transient GET socket failure', async () => {
  const upstreamUrl = 'https://upstream.example.test/retry';
  let attempts = 0;

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any) => {
      attempts += 1;
      assert.equal(String(url), upstreamUrl);
      if (attempts === 1) throw new Error('socket hang up');
      return new Response(JSON.stringify({ ok: true, rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await proxyFetch(upstreamUrl, { method: 'GET' }, 5000);
    const data = await res.json();

    assert.equal(attempts, 2);
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, rows: [] });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyFetch: retries one time on transient GET failed to fetch error', async () => {
  const upstreamUrl = 'https://upstream.example.test/retry-fetch';
  let attempts = 0;

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any) => {
      attempts += 1;
      assert.equal(String(url), upstreamUrl);
      if (attempts === 1) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ok: true, items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await proxyFetch(upstreamUrl, { method: 'GET' }, 5000);
    const data = await res.json();

    assert.equal(attempts, 2);
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, items: [] });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyFetch: retries one time on transient GET upstream 502 html response', async () => {
  const upstreamUrl = 'https://upstream.example.test/retry-502-html';
  let attempts = 0;

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any) => {
      attempts += 1;
      assert.equal(String(url), upstreamUrl);
      if (attempts === 1) {
        return new Response('<html><body>Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(JSON.stringify({ ok: true, data: { shops: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await proxyFetch(upstreamUrl, { method: 'GET' }, 5000);
    const data = await res.json();

    assert.equal(attempts, 2);
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, data: { shops: [] } });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
