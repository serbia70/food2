import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../src/pages/api/admin/reservations/[id]/checkin.ts';

test('admin reservation checkin route: uses params.id and forwards Authorization', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let sawFetch = false;

    Object.defineProperty(globalThis, 'fetch', {
      value: async (url: any, init: any) => {
        sawFetch = true;

        assert.equal(
          String(url),
          'http://localhost:3030/api/admin/reservations/123/checkin',
          'should include params.id in upstream URL',
        );

        assert.equal((init?.method || 'GET').toUpperCase(), 'POST');
        assert.equal(
          (init?.headers as any)?.Authorization,
          'Bearer header-token',
          'should forward Authorization header when present',
        );

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      configurable: true,
      writable: true,
    });

    const request = new Request('http://local/api/admin/reservations/123/checkin', {
      method: 'POST',
      headers: {
        authorization: 'Bearer header-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ table: 't1' }),
    });

    const res = await POST({
      request,
      cookies: { get: () => undefined } as any,
      params: { id: '123' },
    } as any);

    assert.equal(res.status, 200);
    assert.equal(sawFetch, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
