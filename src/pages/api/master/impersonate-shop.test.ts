import assert from 'node:assert/strict';
import test from 'node:test';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('./impersonate-shop.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('GET translates legacy upstream impersonate payload into canonical envelope', async () => {
  const cookieSetCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(url, 'https://food2api.serbia70.com/api/master/impersonate-shop?id=12');
    assert.equal(init?.method, 'GET');
    assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer master-token');

    return new Response(JSON.stringify({
      success: true,
      slug: 'demo-shop',
      token: 'admin-impersonated-token',
      impersonated: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.GET({
    request: new Request('http://localhost:3000/api/master/impersonate-shop?id=12', {
      method: 'GET',
      headers: {
        cookie: 'master_token=master-token',
      },
    }),
    cookies: {
      get(name: string) {
        if (name === 'master_token') return { value: 'master-token' };
        return undefined;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        cookieSetCalls.push({ name, value, options });
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      slug: 'demo-shop',
      token: 'admin-impersonated-token',
      impersonated: true,
    },
  });

  assert.equal(cookieSetCalls.length, 3);
  assert.deepEqual(cookieSetCalls.map((item) => item.name), ['admin_token', 'admin_impersonated', 'master_impersonated']);
});

test('GET also accepts canonical upstream impersonate payload', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(url, 'https://food2api.serbia70.com/api/master/impersonate-shop?id=23');
    assert.equal(init?.method, 'GET');
    assert.equal((init?.headers as Record<string, string> | undefined)?.Authorization, 'Bearer master-token');

    return new Response(JSON.stringify({
      ok: true,
      data: {
        slug: 'canonical-shop',
        token: 'canonical-admin-token',
        impersonated: true,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.GET({
    request: new Request('http://localhost:3000/api/master/impersonate-shop?id=23', {
      method: 'GET',
      headers: {
        cookie: 'master_token=master-token',
      },
    }),
    cookies: {
      get(name: string) {
        if (name === 'master_token') return { value: 'master-token' };
        return undefined;
      },
      set() {
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      slug: 'canonical-shop',
      token: 'canonical-admin-token',
      impersonated: true,
    },
  });
});

test('POST keeps working and also returns canonical envelope', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.equal(url, 'https://food2api.serbia70.com/api/master/impersonate-shop?id=34');

    return new Response(JSON.stringify({
      success: true,
      slug: 'shop-34',
      token: 'token-34',
      impersonated: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.POST({
    request: new Request('http://localhost:3000/api/master/impersonate-shop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'master_token=master-token',
      },
      body: JSON.stringify({ id: 34 }),
    }),
    cookies: {
      get(name: string) {
        if (name === 'master_token') return { value: 'master-token' };
        return undefined;
      },
      set() {
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: {
      slug: 'shop-34',
      token: 'token-34',
      impersonated: true,
    },
  });
});

test('returns 503 backend_unavailable when upstream fetch throws', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.GET({
    request: new Request('http://localhost:3000/api/master/impersonate-shop?id=56', {
      method: 'GET',
      headers: {
        cookie: 'master_token=master-token',
      },
    }),
    cookies: {
      get(name: string) {
        if (name === 'master_token') return { value: 'master-token' };
        return undefined;
      },
      set() {
        return undefined;
      },
    },
  } as any);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'backend_unavailable',
      message: 'Backend unavailable',
    },
  });
});

test('returns 502 when legacy upstream misses required fields', async () => {
  const missingFieldCases = [
    {
      id: 57,
      payload: {
        success: true,
        slug: 'demo-shop',
        impersonated: true,
      },
    },
    {
      id: 58,
      payload: {
        success: true,
        token: 'admin-impersonated-token',
        impersonated: true,
      },
    },
    {
      id: 59,
      payload: {
        slug: 'demo-shop',
        token: 'admin-impersonated-token',
        impersonated: true,
      },
    },
    {
      id: 60,
      payload: {
        success: true,
        slug: 'demo-shop',
        token: 'admin-impersonated-token',
      },
    },
  ];

  for (const testCase of missingFieldCases) {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(testCase.payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const mod = await loadRoute();
    const response = await mod.GET({
      request: new Request(`http://localhost:3000/api/master/impersonate-shop?id=${testCase.id}`, {
        method: 'GET',
        headers: {
          cookie: 'master_token=master-token',
        },
      }),
      cookies: {
        get(name: string) {
          if (name === 'master_token') return { value: 'master-token' };
          return undefined;
        },
        set() {
          return undefined;
        },
      },
    } as any);

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: 'impersonate_failed',
        message: 'Impersonate failed',
      },
    });
  }
});

test('returns 401 when master auth is missing', async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const mod = await loadRoute();
  const response = await mod.GET({
    request: new Request('http://localhost:3000/api/master/impersonate-shop?id=60', {
      method: 'GET',
    }),
    cookies: {
      get() {
        return undefined;
      },
      set() {
        return undefined;
      },
    },
  } as any);

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Unauthorized',
    },
  });
});

test('returns 400 when id is invalid', async () => {
  const invalidIds = ['abc', '-1', '1.5'];

  for (const id of invalidIds) {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const mod = await loadRoute();
    const response = await mod.GET({
      request: new Request(`http://localhost:3000/api/master/impersonate-shop?id=${id}`, {
        method: 'GET',
        headers: {
          cookie: 'master_token=master-token',
        },
      }),
      cookies: {
        get(name: string) {
          if (name === 'master_token') return { value: 'master-token' };
          return undefined;
        },
        set() {
          return undefined;
        },
      },
    } as any);

    assert.equal(fetchCalled, false);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: 'invalid_shop_id',
        message: 'Invalid shop id',
      },
    });
  }
});
