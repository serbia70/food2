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
  mqttSecretConfigured: boolean;
  mqttSecretSummary: string;
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
  const mqttSecret = cleanString(input.mqttSecret);
  const mqttSecretConfigured = mqttSecret !== '';
  return {
    mqttTopicPreview: `restaurant/${shopSlug}/${mqttSecretConfigured ? mqttSecret : '<secret>'}/order`,
    mqttSecretValue: mqttSecret,
    mqttSecretPlaceholder: mqttSecretConfigured
      ? '可直接复制当前 Secret，或生成/输入新 Secret 后点击保存'
      : '输入或生成新 Secret，然后点击保存',
    mqttSecretConfigured,
    mqttSecretSummary: mqttSecretConfigured
      ? `当前已配置 Secret：${mqttSecret}`
      : '当前未配置 Secret，请先生成或手动输入一个新的 Secret',
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
