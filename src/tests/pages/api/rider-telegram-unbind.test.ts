import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'http://localhost:3030';

import { POST } from '../../../pages/api/rider/telegram/unbind.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider telegram unbind 在缺少 rider 信息时返回 rider_session_required', async () => {
  const request = new Request('http://localhost/api/rider/telegram/unbind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riderId: 0, riderPhone: '' }),
  });

  const response = await POST({ request } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'rider_session_required',
  });
});

test('POST rider telegram unbind 会把 telegram_chat_id 清空后转发到后端', async () => {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    assert.equal(url, 'http://localhost:3030/api/rider/status');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 7,
      riderPhone: '0613083899',
      status: 'available',
      telegram_chat_id: '',
      telegramChatId: '',
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const request = new Request('http://localhost/api/rider/telegram/unbind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      riderId: 7,
      riderPhone: '0613083899',
      riderStatus: 'available',
    }),
  });

  const response = await POST({ request } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

test('POST rider telegram unbind 在后端接口抛错时返回 502', async () => {
  globalThis.fetch = async () => {
    throw new Error('network error');
  };

  const request = new Request('http://localhost/api/rider/telegram/unbind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      riderId: 7,
      riderPhone: '0613083899',
      riderStatus: 'available',
    }),
  });

  const response = await POST({ request } as any);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'rider_unbind_failed',
  });
});
