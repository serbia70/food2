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
    fallbackToken: '',
    allowFallbackToken: false,
    method: 'GET',
  });

  assert.equal(res.status, 401);
  assert.ok((res.headers.get('content-type') || '').includes('application/json'));
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'unauthorized');
});

test('proxyMasterRequest: forwards to upstream and preserves status + content-type (text body)', async () => {
  const req = new Request('http://local/api/master/init', {
    headers: { authorization: 'Bearer header-token' },
  });
  const cookies: any = { get: (_k: string) => undefined };

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any, init?: any) => {
      assert.equal(String(url), 'https://upstream.example.test/api/master/init');
      assert.equal((init?.headers || {}).Authorization, 'Bearer header-token');
      return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    };

    const res = await proxyMasterRequest({
      request: req,
      cookies,
      upstreamUrl: 'https://upstream.example.test/api/master/init',
      fallbackToken: '',
      allowFallbackToken: false,
      method: 'GET',
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain');
    assert.equal(await res.text(), 'OK');
  } finally {
    globalThis.fetch = fetchOrig;
  }
});

test('proxyMasterRequest: should NOT allow fallback token unless explicitly enabled', async () => {
  const req = new Request('http://local/api/master/init');
  const cookies: any = { get: (_k: string) => undefined };

  const res = await proxyMasterRequest({
    request: req,
    cookies,
    upstreamUrl: 'https://upstream.example.test/api/master/init',
    fallbackToken: 'fallback-token',
    allowFallbackToken: false,
    method: 'GET',
  });

  assert.equal(res.status, 401);
});
