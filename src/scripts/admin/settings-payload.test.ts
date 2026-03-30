import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminSettingsPayload } from './settings-payload.ts';

test('buildAdminSettingsPayload: includes delivery fields and delivery_type', () => {
  const fd = new FormData();
  fd.set('open', '09:00');
  fd.set('close', '21:00');
  fd.set('zones', 'A,B');
  fd.set('fee', '120');
  fd.set('free_threshold', '999');
  fd.set('print_on_checkout', 'on');

  const payload = buildAdminSettingsPayload(fd, {
    deliveryType: 'platform',
    driversJson: '[]',
    city: 'Belgrade',
    zone: 'Zemun',
    address: 'Main St 1',
    mapUrl: 'https://maps.example.com',
    contactPhone: '0601',
    wechatQr: 'https://cdn.example.com/wechat.png',
    menuTextMode: true,
    telegramToken: 'bot-token',
    telegramChatId: '-1001',
    shopName: 'Test Shop',
    shopCategory: '2',
    shopLogo: 'https://cdn.example.com/logo.png',
    mqttSecret: 'secret-1',
  });

  assert.equal(payload.name, 'Test Shop');
  assert.equal(payload.category, '2');
  assert.equal(payload.logo, 'https://cdn.example.com/logo.png');
  assert.equal(payload.city, 'Belgrade');
  assert.equal(payload.zone, 'Zemun');
  assert.equal(payload.address, 'Main St 1');
  assert.equal(payload.mqtt_secret, 'secret-1');
  assert.equal(payload.menu_text_mode, true);
  assert.deepEqual(payload.currency, { wechat_qr: 'https://cdn.example.com/wechat.png' });
  assert.deepEqual(payload.contact, { phone: '0601', map_url: 'https://maps.example.com' });
  assert.deepEqual(payload.telegram, { token: 'bot-token', chat_id: '-1001' });
  assert.equal(payload.delivery_type, 'platform');
  assert.deepEqual(payload.delivery, { zones: 'A,B', fee: 120, free_threshold: 999 });
  assert.deepEqual(payload.hours, { open: '09:00', close: '21:00' });
  assert.equal(payload.print_on_checkout, true);
  assert.deepEqual(payload.drivers, []);
});

test('buildAdminSettingsPayload: includes shop basics for full save', () => {
  const fd = new FormData();
  const payload = buildAdminSettingsPayload(fd, {
    shopName: 'Shop A',
    shopCategory: '5',
    shopLogo: 'https://cdn.example.com/logo-a.png',
    mqttSecret: 'mqtt-secret-a',
    contactPhone: '0612345678',
  });

  assert.equal(payload.name, 'Shop A');
  assert.equal(payload.category, '5');
  assert.equal(payload.logo, 'https://cdn.example.com/logo-a.png');
  assert.equal(payload.mqtt_secret, 'mqtt-secret-a');
  assert.deepEqual(payload.contact, { phone: '0612345678', map_url: '' });
});

test('buildAdminSettingsPayload: handles missing drivers JSON', () => {
  const fd = new FormData();
  const payload = buildAdminSettingsPayload(fd, { deliveryType: 'merchant' });
  assert.deepEqual(payload.drivers, []);
});
