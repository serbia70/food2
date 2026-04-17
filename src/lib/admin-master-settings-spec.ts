import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchProtectedAdminMasterSettings } from './admin-master-settings.ts';

test('fetchProtectedAdminMasterSettings derives Authorization from admin_token cookie when header is absent', async () => {
  const originalFetch = globalThis.fetch;
  let capturedAuthorization = '';
  let capturedCookie = '';

  globalThis.fetch = async (_input, init) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    capturedAuthorization = String(headers.authorization || '');
    capturedCookie = String(headers.cookie || '');
    return new Response(JSON.stringify({ success: true, settings: { telegram: { chatId: '-1001' } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await fetchProtectedAdminMasterSettings({
      cookie: 'foo=bar; admin_token=test-admin-cookie-token; theme=dark',
    });

    assert.equal(capturedAuthorization, 'Bearer test-admin-cookie-token');
    assert.equal(capturedCookie, 'foo=bar; admin_token=test-admin-cookie-token; theme=dark');
    assert.deepEqual(result, { telegram: { chatId: '-1001' } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchProtectedAdminMasterSettings prefers explicit Authorization header when provided', async () => {
  const originalFetch = globalThis.fetch;
  let capturedAuthorization = '';

  globalThis.fetch = async (_input, init) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    capturedAuthorization = String(headers.authorization || '');
    return new Response(JSON.stringify({ success: true, settings: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await fetchProtectedAdminMasterSettings({
      authorization: 'Bearer explicit-token',
      cookie: 'admin_token=cookie-token',
    });

    assert.equal(capturedAuthorization, 'Bearer explicit-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
