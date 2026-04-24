import assert from 'node:assert/strict';
import test from 'node:test';

import { GET, POST } from '../pages/api/admin/settings/master.ts';

test('admin master settings route rejects browser-facing GET access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, token: 'should-not-leak' }), {
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const response = await GET({
      request: new Request('https://example.com/api/admin/settings/master'),
      cookies: {} as never,
    } as never);
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin master settings route rejects browser-facing POST access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, token: 'should-not-leak' }), {
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const response = await POST({
      request: new Request('https://example.com/api/admin/settings/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      cookies: {} as never,
    } as never);
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
