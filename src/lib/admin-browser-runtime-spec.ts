import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminBrowserSettings } from './admin-browser-runtime.ts';

test('buildAdminBrowserSettings filters sensitive admin settings and keeps save-required fields', () => {
  const input = {
    mqttSecret: 'secret-topic',
    mqtt_secret: 'secret-topic-legacy',
    mqttBroker: 'broker.example.com',
    telegramBotToken: 'bot-token-top-level',
    telegram_bot_token: 'bot-token-legacy',
    menu_layout: 'compact',
    menuTextMode: true,
    category: 'food',
    name: 'Shop Name',
    zone: 'Zemun',
    address: 'Main St 1',
    printOnCheckout: true,
    contact: {
      phone: '0612345678',
      mapUrl: 'https://maps.example.com',
    },
    currency: {
      rate: '0.08',
      wechatQr: 'https://pay.example.com/qr.png',
    },
    telegram: {
      token: 'nested-token',
      chatId: '-100123',
    },
    delivery: {
      fee: 200,
      freeThreshold: 3000,
      zones: 'A,B',
    },
    holidays: {
      enabled: true,
      closed_dates: '2026-05-01',
      message: '休息',
    },
    hours: {
      open: '09:00',
      close: '22:00',
    },
    server: {
      telegramBotToken: 'server-token',
      telegram_bot_token: 'server-token-legacy',
    },
  };

  const result = buildAdminBrowserSettings(input);

  assert.deepEqual(result, {
    mqttBroker: 'broker.example.com',
    menu_layout: 'compact',
    menuTextMode: true,
    category: 'food',
    name: 'Shop Name',
    zone: 'Zemun',
    address: 'Main St 1',
    printOnCheckout: true,
    contact: {
      phone: '0612345678',
      mapUrl: 'https://maps.example.com',
    },
    currency: {
      rate: '0.08',
      wechatQr: 'https://pay.example.com/qr.png',
    },
    telegram: {
      chatId: '-100123',
    },
    delivery: {
      fee: 200,
      freeThreshold: 3000,
      zones: 'A,B',
    },
    holidays: {
      enabled: true,
      closed_dates: '2026-05-01',
      message: '休息',
    },
    hours: {
      open: '09:00',
      close: '22:00',
    },
    server: {},
  });

  assert.equal('mqttSecret' in result, false);
  assert.equal('mqtt_secret' in result, false);
  assert.equal('telegramBotToken' in result, false);
  assert.equal('telegram_bot_token' in result, false);
  assert.equal('token' in (result.telegram || {}), false);
  assert.equal('telegramBotToken' in (result.server || {}), false);
  assert.equal('telegram_bot_token' in (result.server || {}), false);
});
