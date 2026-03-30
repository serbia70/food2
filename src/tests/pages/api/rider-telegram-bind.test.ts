import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../../../pages/api/rider/telegram/bind.ts';

test('POST rider telegram bind 在 process.env 已配置时返回 bind_url', async () => {
  const prevSecret = process.env.TELEGRAM_BIND_SECRET;
  const prevBotName = process.env.TELEGRAM_BOT_NAME;

  try {
    process.env.TELEGRAM_BIND_SECRET = 'test-telegram-bind-secret';
    process.env.TELEGRAM_BOT_NAME = 'food_test_bot';

    const request = new Request('http://localhost/api/rider/telegram/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riderId: 7,
        riderPhone: '0613083899',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 200);

    const payload = await response.json() as {
      success: boolean;
      bind_url?: string;
      expires_at?: string;
    };

    assert.equal(payload.success, true);
    const bindUrl = String(payload.bind_url || '');
    assert.ok(bindUrl.startsWith('https://t.me/food_test_bot?start=bind_'));
    assert.ok(bindUrl.length <= 110);
    assert.ok(String(payload.expires_at || '').length > 0);
  } finally {
    if (prevSecret === undefined) delete process.env.TELEGRAM_BIND_SECRET;
    else process.env.TELEGRAM_BIND_SECRET = prevSecret;
    if (prevBotName === undefined) delete process.env.TELEGRAM_BOT_NAME;
    else process.env.TELEGRAM_BOT_NAME = prevBotName;
  }
});

test('POST rider telegram bind 在未配置时返回 telegram_bind_not_configured', async () => {
  const prevSecret = process.env.TELEGRAM_BIND_SECRET;
  const prevBotName = process.env.TELEGRAM_BOT_NAME;

  try {
    delete process.env.TELEGRAM_BIND_SECRET;
    delete process.env.TELEGRAM_BOT_NAME;

    const request = new Request('http://localhost/api/rider/telegram/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riderId: 7,
        riderPhone: '0613083899',
      }),
    });

    const response = await POST({ request } as any);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      error: 'telegram_bind_not_configured',
    });
  } finally {
    if (prevSecret === undefined) delete process.env.TELEGRAM_BIND_SECRET;
    else process.env.TELEGRAM_BIND_SECRET = prevSecret;
    if (prevBotName === undefined) delete process.env.TELEGRAM_BOT_NAME;
    else process.env.TELEGRAM_BOT_NAME = prevBotName;
  }
});
