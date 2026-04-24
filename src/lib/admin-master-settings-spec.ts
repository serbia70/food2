import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchProtectedAdminMasterSettings, readTelegramCallbackSecretFromMasterSettings } from './admin-master-settings.ts';

test('fetchProtectedAdminMasterSettings derives Authorization from admin_token cookie when header is absent', async () => {
  const originalFetch = globalThis.fetch;
  let capturedAuthorization = '';
  let capturedCookie = '';

  globalThis.fetch = async (_input, init) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    capturedAuthorization = headers.authorization || '';
    capturedCookie = headers.cookie || '';
    return new Response(JSON.stringify({ success: true, settings: { telegram: { chatId: '-1001' } } }), {
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
    capturedAuthorization = headers.authorization || '';
    return new Response(JSON.stringify({ success: true, settings: {} }), {
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

test('readTelegramCallbackSecretFromMasterSettings prefers callback secret and falls back to webhook secret', () => {
  assert.equal(
    readTelegramCallbackSecretFromMasterSettings({
      telegramCallbackSecret: 'callback-top-level',
      telegramWebhookSecret: 'webhook-top-level',
      server: {
        telegramCallbackSecret: 'callback-server',
      },
    }),
    'callback-top-level',
  );

  assert.equal(
    readTelegramCallbackSecretFromMasterSettings({
      server: {
        telegramWebhookSecret: 'webhook-server',
      },
    }),
    'webhook-server',
  );

  assert.equal(
    readTelegramCallbackSecretFromMasterSettings({
      telegram: {
        callback_secret: 'callback-telegram',
      },
    }),
    'callback-telegram',
  );

  assert.equal(readTelegramCallbackSecretFromMasterSettings({}), '');
});
