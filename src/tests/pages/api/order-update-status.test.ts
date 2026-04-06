import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/order/update_status/[id].ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST order update_status 动态路由会把 id 透传到后端路径', async () => {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    assert.equal(url, 'https://api.test.local/api/order/update_status/476');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 476,
      status: 'delivering',
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost/api/order/update_status/476', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 476, status: 'delivering' }),
    }),
    params: { id: '476' },
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

test('POST order update_status 动态路由在缺少 id 时返回 400', async () => {
  globalThis.fetch = async () => {
    throw new Error('should not call upstream without id');
  };

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost/api/order/update_status/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivering' }),
    }),
    params: {},
  } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'order_id_required',
  });
});
