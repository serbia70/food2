import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMasterSettingsView } from '../../../src/lib/master-settings-view.ts';

test('buildMasterSettingsView 输出 pricing/footer/rate/storage/server/backup 主要字段', () => {
  const view = buildMasterSettingsView({
    reservationEnabled: 1,
    reservationCommissionType: 'percentage',
    reservationCommissionValue: 3,
    deliveryEnabled: 1,
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: 25,
    defaultShopTier: 'business',
    footer_text: 'footer text',
    footer_phone: '381600000000',
    footer_copyright: 'copyright',
    exchange_rate: 117.3,
    display_final_rate: 119.9,
    rate_base: 117,
    rate_offset: 2,
    rate_step: 0.5,
    image_storage: 'r2',
    r2_public_domain: 'https://cdn.example.com',
    upload_strict_r2: 1,
    mqtt_broker: 'mqtt://broker',
    telegram_webhook_secret: 'secret',
    telegram_chat_id: 'chat-1',
    telegram_bot_token: 'token-1',
    categories: [{ name: 'A' }],
    backup_time: '03:00',
    backup_retention: 10,
    backup_target: 's3',
    backup_host: 'host',
    backup_user: 'user',
    backup_pass: 'pass',
    backup_path: '/backup',
    backup_endpoint: 'endpoint',
    backup_bucket: 'bucket',
  });

  assert.equal(view.reservationPlan.commissionValue, 3);
  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.defaultShopTier, 'business');
  assert.equal(view.defaultShopTierText, '商务版');
  assert.equal(view.footer.footerText, 'footer text');
  assert.equal(view.rate.exchangeRate, 117.3);
  assert.equal(view.storage.imageStorage, 'r2');
  assert.equal(view.storage.uploadStrictR2, true);
  assert.equal(view.server.telegramBotToken, 'token-1');
  assert.deepEqual(JSON.parse(view.categories.categoriesJson), [{ name: 'A' }]);
  assert.equal(view.backup.backupRetention, 10);
});

test('buildMasterSettingsView 支持 nested server/shopDefaults fallback', () => {
  const view = buildMasterSettingsView({
    shopDefaults: {
      city: 'Belgrade',
      hours: {
        open: '09:00',
        close: '22:00',
      },
    },
    server: {
      mqtt_broker: 'mqtt://nested',
      telegram_webhook_secret: 'nested-secret',
      telegram_chat_id: 'nested-chat',
      telegram_bot_token: 'nested-token',
    },
  });

  assert.equal(view.shopDefaults.city, 'Belgrade');
  assert.equal(view.shopDefaults.hours.open, '09:00');
  assert.equal(view.shopDefaults.hours.close, '22:00');
  assert.equal(view.server.mqttBroker, 'mqtt://nested');
  assert.equal(view.server.telegramWebhookSecret, 'nested-secret');
  assert.equal(view.server.telegramChatId, 'nested-chat');
  assert.equal(view.server.telegramBotToken, 'nested-token');
});
