import test from 'node:test';
import assert from 'node:assert/strict';

import { proxyMasterRequest } from './master-api-route.ts';

test('proxyMasterRequest: returns 401 unauthorized when no auth', async () => {
  const req = new Request('http://local/api/master/init');
  const cookies: any = { get: (_k: string) => undefined };

  const res = await proxyMasterRequest({
    request: req,
    cookies,
    upstreamUrl: 'https://upstream.example.test/api/master/init',
    method: 'GET',
  });

  assert.equal(res.status, 401);
  assert.ok((res.headers.get('content-type') || '').includes('application/json'));
  assert.deepEqual(await res.json(), {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Unauthorized',
    },
  });
});

test('proxyMasterRequest: forwards to upstream and preserves status + content-type (text body)', async () => {
  const req = new Request('http://local/api/master/init', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = { get: (_k: string) => undefined };

  const fetchOrig = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), 'https://upstream.example.test/api/master/init');
      assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer header-token');
      return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }) as typeof fetch;

    const res = await proxyMasterRequest({
      request: req,
      cookies,
      upstreamUrl: 'https://upstream.example.test/api/master/init',
      method: 'GET',
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain');
    assert.equal(await res.text(), 'OK');
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyMasterRequest: maps backend connection close to 502 on GET', async () => {
  const req = new Request('http://local/api/master/dispatch', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = { get: (_k: string) => undefined };

  const fetchOrig = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      assert.equal(String(url), 'https://upstream.example.test/api/master/dispatch');
      assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer header-token');
      throw new Error('fetch failed');
    }) as typeof fetch;

    const res = await proxyMasterRequest({
      request: req,
      cookies,
      upstreamUrl: 'https://upstream.example.test/api/master/dispatch',
      method: 'GET',
    });

    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), {
      ok: false,
      error: {
        code: 'backend_connection_closed',
        message: 'Backend connection closed unexpectedly',
      },
    });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyMasterRequest: forwards GET to upstream with master auth', async () => {
  const req = new Request('http://local/api/master/settings', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = { get: (_k: string) => undefined };

  const fetchOrig = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), 'https://upstream.example.test/api/master/settings');
      assert.equal(init?.method, 'GET');
      assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer header-token');
      return new Response(JSON.stringify({ success: true, settings: { telegramBotToken: 'token-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const res = await proxyMasterRequest({
      request: req,
      cookies,
      upstreamUrl: 'https://upstream.example.test/api/master/settings',
      method: 'GET',
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      success: true,
      settings: { telegramBotToken: 'token-1' },
    });
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
