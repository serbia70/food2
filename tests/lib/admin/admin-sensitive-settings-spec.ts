import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminSensitiveSettingsPatch, buildAdminSensitiveSettingsView } from '../../../src/lib/admin-sensitive-settings.ts';

test('buildAdminSensitiveSettingsView keeps mqtt secret visible for copy/paste workflows', () => {
  const view = buildAdminSensitiveSettingsView({
    shopSlug: 'pizza-one',
    mqttSecret: 'secret-topic',
    telegramToken: 'bot-token',
    telegramChatId: '-100123',
  });

  assert.deepEqual(view, {
    mqttTopicPreview: 'restaurant/pizza-one/secret-topic/order',
    mqttSecretValue: 'secret-topic',
    mqttSecretPlaceholder: '可直接复制当前 Secret，或生成/输入新 Secret 后点击保存',
    mqttSecretConfigured: true,
    mqttSecretSummary: '当前已配置 Secret：secret-topic',
    telegramTokenValue: '',
    telegramTokenPlaceholder: '输入新 Bot Token，留空不修改',
    telegramChatIdValue: '-100123',
  });
});

test('buildAdminSensitiveSettingsView shows unconfigured mqtt secret state', () => {
  const view = buildAdminSensitiveSettingsView({
    shopSlug: 'pizza-one',
    mqttSecret: '',
  });

  assert.deepEqual(view, {
    mqttTopicPreview: 'restaurant/pizza-one/<secret>/order',
    mqttSecretValue: '',
    mqttSecretPlaceholder: '输入或生成新 Secret，然后点击保存',
    mqttSecretConfigured: false,
    mqttSecretSummary: '当前未配置 Secret，请先生成或手动输入一个新的 Secret',
    telegramTokenValue: '',
    telegramTokenPlaceholder: '输入新 Bot Token，留空不修改',
    telegramChatIdValue: '',
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

