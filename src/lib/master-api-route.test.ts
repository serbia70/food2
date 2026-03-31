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
