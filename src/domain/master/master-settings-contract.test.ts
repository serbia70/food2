import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMasterSettingsContract } from './master-settings-contract.ts';

test('master settings contract accepts canonical keys', () => {
  const settings = parseMasterSettingsContract({
    mqttBroker: 'mqtt.example.com',
    defaultShopTier: 'standard',
  });

  assert.equal(settings.mqttBroker, 'mqtt.example.com');
  assert.equal(settings.defaultShopTier, 'standard');
});

test('master settings contract rejects legacy snake_case keys', () => {
  assert.throws(() =>
    parseMasterSettingsContract({
      mqtt_broker: 'mqtt.example.com',
      default_shop_tier: 'standard',
    }),
  );
});
