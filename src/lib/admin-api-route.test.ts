import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminAuthHeader, proxyAdminRequest, readAdminAuth } from './admin-api-route.ts';

type CookieValue = { value: string };

type CookieJar = {
  get: (key: string) => CookieValue | undefined;
};

function makeCookies(values: Record<string, string | undefined>): CookieJar {
  return {
    get(key: string) {
      const value = values[key];
      return value ? { value } : undefined;
    },
  };
}

function getHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) return undefined;

  const lower = name.toLowerCase();

  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(lower) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === lower);
    return found?.[1];
  }

  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }

  return undefined;
}

test('readAdminAuth: header 优先于 cookie', () => {
  const request = new Request('http://localhost/admin', {
    headers: { Authorization: 'Bearer header-token' },
  });

  const cookies = makeCookies({ admin_token: 'cookie-token' });

  assert.equal(readAdminAuth(request, cookies as any), 'Bearer header-token');
});

test('readAdminAuth: 无 header + 无 cookie 时返回空字符串', () => {
  const request = new Request('http://localhost/admin');
  const cookies = makeCookies({});

  assert.equal(readAdminAuth(request, cookies as any), '');
});

test('readAdminAuth: Astro cookies 取不到时回退读取原始 Cookie 头', () => {
  const request = new Request('http://localhost/admin', {
    headers: { cookie: 'foo=1; admin_token=raw-cookie-token; bar=2' },
  });
  const cookies = makeCookies({});

  assert.equal(readAdminAuth(request, cookies as any), 'Bearer raw-cookie-token');
});

test('buildAdminAuthHeader: 无 auth 时返回空对象', () => {
  const request = new Request('http://localhost/admin');
  const cookies = makeCookies({});

  assert.deepEqual(buildAdminAuthHeader(request, cookies as any), {});
});

test('proxyAdminRequest: 合并计算出的 Authorization 与调用方 headers', async () => {
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

    const request = new Request('http://localhost/admin', { method: 'POST' });
    const cookies = makeCookies({ admin_token: 'cookie-token' });

    await proxyAdminRequest({
      request,
      cookies: cookies as any,
      url: 'http://example.test/upstream',
      headers: { 'X-Test': '1' },
    });

    assert.ok(capturedInit, 'expected fetch to be called');
    assert.equal(getHeader(capturedInit!.headers, 'Authorization'), 'Bearer cookie-token');
    assert.equal(getHeader(capturedInit!.headers, 'X-Test'), '1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxyAdminRequest: 调用方 Authorization 覆盖计算出的 auth（保持当前行为）', async () => {
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

    const request = new Request('http://localhost/admin');
    const cookies = makeCookies({ admin_token: 'cookie-token' });

    await proxyAdminRequest({
      request,
      cookies: cookies as any,
      url: 'http://example.test/upstream',
      headers: { Authorization: 'Bearer caller-token' },
    });

    assert.ok(capturedInit, 'expected fetch to be called');
    assert.equal(getHeader(capturedInit!.headers, 'Authorization'), 'Bearer caller-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
