import test from 'node:test';
import assert from 'node:assert/strict';

async function loadSecretsModule(tag: string) {
  return import(`./telegram-secrets.ts?test=${tag}-${Date.now()}`);
}

test('readTelegramCallbackSecret 优先 callback secret，再回退 webhook secret 与 jwt secret', async () => {
  const previousCallback = process.env.TELEGRAM_CALLBACK_SECRET;
  const previousWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;
  const previousJwt = process.env.JWT_SECRET;

  try {
    process.env.TELEGRAM_CALLBACK_SECRET = ' callback-secret ';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret';
    process.env.JWT_SECRET = 'jwt-secret';

    let mod = await loadSecretsModule('callback-first');
    assert.equal(mod.readTelegramCallbackSecret(), 'callback-secret');

    delete process.env.TELEGRAM_CALLBACK_SECRET;
    mod = await loadSecretsModule('callback-fallback-webhook');
    assert.equal(mod.readTelegramCallbackSecret(), 'webhook-secret');

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    mod = await loadSecretsModule('callback-fallback-jwt');
    assert.equal(mod.readTelegramCallbackSecret(), 'jwt-secret');
  } finally {
    if (previousCallback == null) delete process.env.TELEGRAM_CALLBACK_SECRET;
    else process.env.TELEGRAM_CALLBACK_SECRET = previousCallback;
    if (previousWebhook == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousWebhook;
    if (previousJwt == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
  }
});

test('readTelegramRequestSecret 优先 webhook secret，再回退 callback secret', async () => {
  const previousCallback = process.env.TELEGRAM_CALLBACK_SECRET;
  const previousWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    process.env.TELEGRAM_CALLBACK_SECRET = ' callback-secret ';
    process.env.TELEGRAM_WEBHOOK_SECRET = ' webhook-secret ';

    let mod = await loadSecretsModule('request-first');
    assert.equal(mod.readTelegramRequestSecret(), 'webhook-secret');

    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    mod = await loadSecretsModule('request-fallback-callback');
    assert.equal(mod.readTelegramRequestSecret(), 'callback-secret');
  } finally {
    if (previousCallback == null) delete process.env.TELEGRAM_CALLBACK_SECRET;
    else process.env.TELEGRAM_CALLBACK_SECRET = previousCallback;
    if (previousWebhook == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousWebhook;
  }
});
