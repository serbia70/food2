import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as masterLoginPost } from '../../../pages/api/master/login.ts';
import { POST as adminLoginPost } from '../../../pages/api/admin/login.ts';
import { GET as authCheckGet } from '../../../pages/api/auth/check.ts';
import { POST as masterLogoutPost } from '../../../pages/api/master/logout.ts';
import { POST as adminLogoutPost } from '../../../pages/api/admin/logout.ts';
import { POST as masterImpersonatePost } from '../../../pages/api/master/impersonate-shop.ts';
import { GET as shopListGet } from '../../../pages/api/shop/list.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('master login 只接受 canonical upstream envelope', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      ok: true,
      data: {
        token: 'master-token',
        userId: 9,
        displayName: 'Master 9',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const cookieStore: Array<{ name: string; value: string }> = [];
  const res = await masterLoginPost({
    request: new Request('https://food2.serbia70.com/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y' }),
    }),
    cookies: {
      set(name: string, value: string) {
        cookieStore.push({ name, value });
      },
    },
  } as any);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, {
    ok: true,
    data: {
      kind: 'master',
      isAuthenticated: true,
      token: 'master-token',
      userId: 9,
      displayName: 'Master 9',
    },
  });
  assert.equal(cookieStore[0]?.name, 'master_token');
  assert.equal(cookieStore[0]?.value, 'master-token');
});

test('master login 拒绝 legacy success shape', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ success: true, token: 'legacy-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const res = await masterLoginPost({
    request: new Request('https://food2.serbia70.com/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y' }),
    }),
    cookies: { set() {} },
  } as any);

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Invalid credentials',
    },
  });
});

test('admin login 只接受 canonical upstream envelope', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      ok: true,
      data: {
        token: 'admin-token',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const cookieStore: Array<{ name: string; value: string }> = [];
  const res = await adminLoginPost({
    request: new Request('https://food2.serbia70.com/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: '21', password: 'pass' }),
    }),
    cookies: {
      set(name: string, value: string) {
        cookieStore.push({ name, value });
      },
    },
  } as any);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true,
    data: {
      kind: 'admin',
      isAuthenticated: true,
      token: 'admin-token',
    },
  });
  assert.equal(cookieStore[0]?.name, 'admin_token');
  assert.equal(cookieStore[0]?.value, 'admin-token');
});

test('admin login 拒绝 legacy success 与裸 token shape', async () => {
  const legacyPayloads = [
    { success: true, token: 'legacy-token' },
    { token: 'legacy-token' },
  ];

  for (const payload of legacyPayloads) {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const res = await adminLoginPost({
      request: new Request('https://food2.serbia70.com/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: '21', password: 'pass' }),
      }),
      cookies: { set() {} },
    } as any);

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'Invalid credentials',
      },
    });
  }
});

test('auth check 返回 canonical envelope（含未登录与已登录）', async () => {
  const unauthorized = await authCheckGet({
    cookies: { get: () => undefined },
  } as any);

  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), {
    ok: true,
    data: {
      kind: 'guest',
      isAuthenticated: false,
    },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ ok: true, data: { shop_id: 21 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const authorized = await authCheckGet({
    cookies: {
      get(name: string) {
        if (name === 'admin_token') return { value: 'admin-token' };
        return undefined;
      },
    },
  } as any);

  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    ok: true,
    data: {
      kind: 'admin',
      isAuthenticated: true,
      token: 'admin-token',
      userId: 21,
    },
  });
});

test('auth check source reads backend snake_case shop_id field', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const source = await readFile(resolve(process.cwd(), 'src/pages/api/auth/check.ts'), 'utf8');

  assert.match(source, /const shopIdRaw = data\.shop_id;/);
  assert.doesNotMatch(source, /data\.shopId/);
});

test('master/admin logout 返回非双包裹 canonical envelope', async () => {
  const master = await masterLogoutPost({
    request: new Request('https://food2.serbia70.com/api/master/logout', { method: 'POST' }),
    cookies: { set() {} },
  } as any);
  assert.equal(master.status, 200);
  assert.deepEqual(await master.json(), {
    ok: true,
    data: {
      kind: 'guest',
      isAuthenticated: false,
    },
  });

  const admin = await adminLogoutPost({
    cookies: { delete() {} },
  } as any);
  assert.equal(admin.status, 200);
  assert.deepEqual(await admin.json(), {
    ok: true,
    data: {
      kind: 'guest',
      isAuthenticated: false,
    },
  });
});

test('master login 在上游非 2xx 时透传 canonical error', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'backend_unavailable',
        message: 'Master auth backend unavailable',
      },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const res = await masterLoginPost({
    request: new Request('https://food2.serbia70.com/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y' }),
    }),
    cookies: { set() {} },
  } as any);

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    ok: false,
    error: {
      code: 'backend_unavailable',
      message: 'Master auth backend unavailable',
    },
  });
});

test('admin login 在上游非 2xx 时透传 canonical error', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'shop_locked',
        message: 'Shop is locked',
      },
    }), {
      status: 423,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const res = await adminLoginPost({
    request: new Request('https://food2.serbia70.com/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: '21', password: 'pass' }),
    }),
    cookies: { set() {} },
  } as any);

  assert.equal(res.status, 423);
  assert.deepEqual(await res.json(), {
    ok: false,
    error: {
      code: 'shop_locked',
      message: 'Shop is locked',
    },
  });
});

test('master login 在上游异常时返回稳定的 canonical 错误而不泄露内部消息', async () => {
  globalThis.fetch = (async () => {
    throw new Error('socket hang up');
  }) as typeof fetch;

  const res = await masterLoginPost({
    request: new Request('https://food2.serbia70.com/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: 'y' }),
    }),
    cookies: { set() {} },
  } as any);

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    ok: false,
    error: {
      code: 'backend_unavailable',
      message: 'Backend unavailable',
    },
  });
});

test('master impersonate-shop 仅接受 legacy upstream shape 并返回 canonical 结果', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ success: true, token: 'admin-token', slug: 'shop-21', impersonated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const cookieStore: Array<{ name: string; value: string }> = [];
  const okRes = await masterImpersonatePost({
    request: new Request('https://food2.serbia70.com/api/master/impersonate-shop', {
      method: 'POST',
      headers: { authorization: 'Bearer master-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 21 }),
    }),
    cookies: {
      get() {
        return undefined;
      },
      set(name: string, value: string) {
        cookieStore.push({ name, value });
      },
    },
  } as any);

  assert.equal(okRes.status, 200);
  assert.deepEqual(await okRes.json(), {
    ok: true,
    data: {
      slug: 'shop-21',
      token: 'admin-token',
      impersonated: true,
    },
  });
  assert.equal(cookieStore[0]?.name, 'admin_token');
  assert.equal(cookieStore[0]?.value, 'admin-token');

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ success: true, token: 'legacy-token', slug: 'legacy-shop' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const legacyRes = await masterImpersonatePost({
    request: new Request('https://food2.serbia70.com/api/master/impersonate-shop', {
      method: 'POST',
      headers: { authorization: 'Bearer master-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 21 }),
    }),
    cookies: {
      get() {
        return undefined;
      },
      set() {},
    },
  } as any);

  assert.equal(legacyRes.status, 502);
  assert.deepEqual(await legacyRes.json(), {
    ok: false,
    error: {
      code: 'impersonate_failed',
      message: 'Impersonate failed',
    },
  });
});

test('shop list 透传 home payload 并保留 GET 重试与错误透传', async () => {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ shops: [{ id: 1, slug: 'a' }], settings: { theme: 'x' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const okRes = await shopListGet();
  assert.equal(okRes.status, 200);
  assert.deepEqual(await okRes.json(), {
    shops: [{ id: 1, slug: 'a' }],
    settings: { theme: 'x' },
  });

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'shops_unavailable',
        message: 'Shop list unavailable',
      },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const upstreamFailRes = await shopListGet();
  assert.equal(upstreamFailRes.status, 503);
  assert.deepEqual(await upstreamFailRes.json(), {
    ok: false,
    error: {
      code: 'shops_unavailable',
      message: 'Shop list unavailable',
    },
  });

  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('socket hang up');
    return new Response(JSON.stringify({ shops: [{ id: 2, slug: 'b' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const retriedRes = await shopListGet();
  assert.equal(retriedRes.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(await retriedRes.json(), {
    shops: [{ id: 2, slug: 'b' }],
  });

  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  const failRes = await shopListGet();
  assert.equal(failRes.status, 503);
  assert.deepEqual(await failRes.json(), {
    ok: false,
    error: {
      code: 'backend_unavailable',
      message: 'Backend unavailable',
    },
  });
});
