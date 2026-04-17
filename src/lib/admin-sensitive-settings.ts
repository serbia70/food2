type SensitiveSettingsViewInput = {
  shopSlug?: string;
  mqttSecret?: string;
  telegramToken?: string;
  telegramChatId?: string;
};

export type AdminSensitiveSettingsView = {
  mqttTopicPreview: string;
  mqttSecretValue: string;
  mqttSecretPlaceholder: string;
  telegramTokenValue: string;
  telegramTokenPlaceholder: string;
  telegramChatIdValue: string;
};

export type AdminSensitiveSettingsPatchInput = {
  mqttSecret?: string;
  telegramToken?: string;
  telegramChatId?: string;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildAdminSensitiveSettingsView(input: SensitiveSettingsViewInput): AdminSensitiveSettingsView {
  const shopSlug = cleanString(input.shopSlug) || 'default';
  return {
    mqttTopicPreview: `restaurant/${shopSlug}/<secret>/order`,
    mqttSecretValue: '',
    mqttSecretPlaceholder: '输入新 Secret，留空不修改',
    telegramTokenValue: '',
    telegramTokenPlaceholder: '输入新 Bot Token，留空不修改',
    telegramChatIdValue: cleanString(input.telegramChatId),
  };
}

export function buildAdminSensitiveSettingsPatch(input: AdminSensitiveSettingsPatchInput): Record<string, unknown> {
  const mqttSecret = cleanString(input.mqttSecret);
  const telegramToken = cleanString(input.telegramToken);
  const telegramChatId = cleanString(input.telegramChatId);
  const patch: Record<string, unknown> = {};
  const telegramPatch: Record<string, string> = {};

  if (mqttSecret) {
    patch.mqttSecret = mqttSecret;
  }
  if (telegramToken) {
    telegramPatch.token = telegramToken;
  }
  if (input.telegramChatId !== undefined) {
    telegramPatch.chatId = telegramChatId;
  }
  if (Object.keys(telegramPatch).length > 0) {
    patch.telegram = telegramPatch;
  }

  return patch;
}
