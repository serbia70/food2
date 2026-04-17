import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { createSessionPayload } from '../application/auth/load-session-query.ts';
import { POST as handleAdminLogin } from '../pages/api/admin/login.ts';
import { POST as handleMasterLogin } from '../pages/api/master/login.ts';
import { GET as handleAuthCheck } from '../pages/api/auth/check.ts';
import { GET as handleMasterImpersonateGet, POST as handleMasterImpersonatePost } from '../pages/api/master/impersonate-shop.ts';

type CookieState = {
  value: string;
  options?: Record<string, unknown>;
};

type CookieJar = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
  delete: (name: string) => void;
  values: Map<string, CookieState>;
};

type FetchHandler = (request: Request) => Promise<Response>;

function createCookieJar(seed: Record<string, string> = {}): CookieJar {
  const values = new Map<string, CookieState>(Object.entries(seed).map(([key, value]) => [key, { value }]));

  return {
    values,
    get(name: string) {
      const entry = values.get(name);
      return entry ? { value: entry.value } : undefined;
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      values.set(name, { value, options });
    },
    delete(name: string) {
      values.delete(name);
    },
  };
}

function useMockFetch(t: TestContext, handler: FetchHandler): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('createSessionPayload omits token from session payload', () => {
  const payload = createSessionPayload({
    kind: 'admin',
    userId: 12,
  });

  assert.deepEqual(payload, {
    kind: 'admin',
    isAuthenticated: true,
    userId: 12,
  });
  assert.equal('token' in payload, false);
});

test('admin login sets cookie without returning token', async (t) => {
  useMockFetch(t, async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url.endsWith('/api/login')) {
      return jsonResponse({ ok: true, data: { token: 'admin-secret' } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const cookies = createCookieJar();
  const response = await handleAdminLogin({
    request: new Request('https://example.com/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: 'shop-a', password: 'pw' }),
    }),
    cookies,
  } as never);
  const body = JSON.parse(await response.text()) as { ok?: boolean; data?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(cookies.get('admin_token')?.value, 'admin-secret');
  assert.equal(body.data?.kind, 'admin');
  assert.equal(body.data?.isAuthenticated, true);
  assert.equal('token' in (body.data || {}), false);
});

test('master login sets cookie without returning token', async (t) => {
  useMockFetch(t, async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url.endsWith('/api/master/login')) {
      return jsonResponse({ ok: true, data: { token: 'master-secret', userId: 7, displayName: 'Boss' } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const cookies = createCookieJar();
  const response = await handleMasterLogin({
    request: new Request('https://example.com/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pw' }),
    }),
    cookies,
  } as never);
  const body = JSON.parse(await response.text()) as { ok?: boolean; data?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(cookies.get('master_token')?.value, 'master-secret');
  assert.deepEqual(body.data, {
    kind: 'master',
    isAuthenticated: true,
    userId: 7,
    displayName: 'Boss',
  });
  assert.equal('token' in (body.data || {}), false);
});

test('auth check does not echo admin cookie token', async (t) => {
  useMockFetch(t, async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url.endsWith('/api/admin/status')) {
      assert.equal(request.headers.get('Authorization'), 'Bearer cookie-secret');
      return jsonResponse({ ok: true, data: { shop_id: 21 } });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const response = await handleAuthCheck({
    cookies: createCookieJar({ admin_token: 'cookie-secret' }),
  } as never);
  const body = JSON.parse(await response.text()) as { ok?: boolean; data?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, {
    kind: 'admin',
    isAuthenticated: true,
    userId: 21,
  });
  assert.equal('token' in (body.data || {}), false);
});

test('master impersonate-shop rejects GET with 405', async () => {
  const response = await handleMasterImpersonateGet({
    request: new Request('https://example.com/api/master/impersonate-shop?id=9'),
    cookies: createCookieJar({ master_token: 'master-secret' }),
  } as never);
  const body = JSON.parse(await response.text()) as { ok?: boolean; error?: { code?: string } };

  assert.equal(response.status, 405);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, 'method_not_allowed');
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('master impersonate-shop post sets cookie without returning token', async (t) => {
  useMockFetch(t, async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url.includes('/api/master/impersonate-shop?id=9')) {
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('Authorization'), 'Bearer master-secret');
      return jsonResponse({ success: true, token: 'admin-secret', slug: 'shop-a', impersonated: true });
    }
    throw new Error(`Unexpected fetch: ${request.method} ${request.url}`);
  });

  const cookies = createCookieJar({ master_token: 'master-secret' });
  const response = await handleMasterImpersonatePost({
    request: new Request('https://example.com/api/master/impersonate-shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 9 }),
    }),
    cookies,
  } as never);
  const body = JSON.parse(await response.text()) as { ok?: boolean; data?: Record<string, unknown> };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(cookies.get('admin_token')?.value, 'admin-secret');
  assert.deepEqual(body.data, {
    slug: 'shop-a',
    impersonated: true,
  });
  assert.equal('token' in (body.data || {}), false);
});
