import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminSensitiveSettingsPatch, buildAdminSensitiveSettingsView } from './admin-sensitive-settings.ts';

test('buildAdminSensitiveSettingsView redacts secret values but keeps non-sensitive chat id', () => {
  const view = buildAdminSensitiveSettingsView({
    shopSlug: 'pizza-one',
    mqttSecret: 'secret-topic',
    telegramToken: 'bot-token',
    telegramChatId: '-100123',
  });

  assert.deepEqual(view, {
    mqttTopicPreview: 'restaurant/pizza-one/<secret>/order',
    mqttSecretValue: '',
    mqttSecretPlaceholder: '输入新 Secret，留空不修改',
    telegramTokenValue: '',
    telegramTokenPlaceholder: '输入新 Bot Token，留空不修改',
    telegramChatIdValue: '-100123',
  });
});

test('buildAdminSensitiveSettingsPatch omits blank secrets but keeps explicit chat id updates', () => {
  const patch = buildAdminSensitiveSettingsPatch({
    mqttSecret: '   ',
    telegramToken: '',
    telegramChatId: '-100456',
  });

  assert.deepEqual(patch, {
    telegram: {
      chatId: '-100456',
    },
  });
});

test('buildAdminSensitiveSettingsPatch includes trimmed secrets when provided', () => {
  const patch = buildAdminSensitiveSettingsPatch({
    mqttSecret: '  next-secret  ',
    telegramToken: '  bot-next  ',
    telegramChatId: '',
  });

  assert.deepEqual(patch, {
    mqttSecret: 'next-secret',
    telegram: {
      token: 'bot-next',
      chatId: '',
    },
  });
});
