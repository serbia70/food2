import {
  pickSetting,
  pickSettingFromNestedObject,
  toBoolean,
  toChoice,
  toJsonString,
  toNumber,
  toPositiveNumber,
  toStringValue,
} from './master-settings-normalizers.ts';

type MasterSettingsInput = Record<string, unknown>;

export function buildFooterSettings(settings: MasterSettingsInput) {
  return {
    footerText: toStringValue(pickSetting(settings, 'footerText', 'footer_text')),
    footerPhone: toStringValue(pickSetting(settings, 'footerPhone', 'footer_phone')),
    footerCopyright: toStringValue(pickSetting(settings, 'footerCopyright', 'footer_copyright')),
  };
}

export function buildRateSettings(settings: MasterSettingsInput) {
  return {
    exchangeRate: toNumber(pickSetting(settings, 'exchangeRate', 'exchange_rate'), 0),
    displayFinalRate: toNumber(pickSetting(settings, 'displayFinalRate', 'display_final_rate'), 0),
    rateBase: toNumber(pickSetting(settings, 'rateBase', 'rate_base'), 0),
    rateOffset: toNumber(pickSetting(settings, 'rateOffset', 'rate_offset'), 0),
    rateStep: toNumber(pickSetting(settings, 'rateStep', 'rate_step'), 0),
  };
}

export function buildWechatSettings(settings: MasterSettingsInput) {
  return {
    wechatId: toStringValue(pickSetting(settings, 'wechatId', 'wechat_id')),
    wechatContactQr: toStringValue(pickSetting(settings, 'wechatContactQr', 'wechat_contact_qr')),
    alipayPaymentQr: toStringValue(pickSetting(settings, 'alipayPaymentQr', 'alipay_payment_qr')),
    wechatPaymentQr: toStringValue(pickSetting(settings, 'wechatPaymentQr', 'wechat_payment_qr')),
  };
}

export function buildStorageSettings(settings: MasterSettingsInput) {
  return {
    imageStorage: toChoice(pickSetting(settings, 'imageStorage', 'image_storage'), ['local', 'r2'], 'local'),
    r2PublicDomain: toStringValue(pickSetting(settings, 'r2PublicDomain', 'r2_public_domain')),
    uploadStrictR2: toBoolean(pickSetting(settings, 'uploadStrictR2', 'upload_strict_r2'), false),
  };
}

export function buildServerSettings(settings: MasterSettingsInput) {
  return {
    mqttBroker: toStringValue(
      pickSetting(settings, 'mqttBroker', 'mqtt_broker')
        ?? pickSettingFromNestedObject(settings, ['server'], ['mqttBroker', 'mqtt_broker']),
    ),
    telegramWebhookSecret: toStringValue(
      pickSetting(settings, 'telegramWebhookSecret', 'telegram_webhook_secret')
        ?? pickSettingFromNestedObject(settings, ['server'], ['telegramWebhookSecret', 'telegram_webhook_secret']),
    ),
    telegramChatId: toStringValue(
      pickSetting(settings, 'telegramChatId', 'telegram_chat_id')
        ?? pickSettingFromNestedObject(settings, ['server'], ['telegramChatId', 'telegram_chat_id']),
    ),
    telegramBotToken: toStringValue(
      pickSetting(settings, 'telegramBotToken', 'telegram_bot_token')
        ?? pickSettingFromNestedObject(settings, ['server'], ['telegramBotToken', 'telegram_bot_token']),
    ),
  };
}

export function buildCategorySettings(settings: MasterSettingsInput) {
  return {
    categoriesJson: toJsonString(settings?.categories, '[]'),
  };
}

export function buildBackupSettings(settings: MasterSettingsInput) {
  return {
    backupTime: toStringValue(pickSetting(settings, 'backupTime', 'backup_time')),
    backupRetention: toPositiveNumber(pickSetting(settings, 'backupRetention', 'backup_retention'), 7),
    backupTarget: toStringValue(pickSetting(settings, 'backupTarget', 'backup_target')),
    backupHost: toStringValue(pickSetting(settings, 'backupHost', 'backup_host')),
    backupUser: toStringValue(pickSetting(settings, 'backupUser', 'backup_user')),
    backupPass: toStringValue(pickSetting(settings, 'backupPass', 'backup_pass')),
    backupPath: toStringValue(pickSetting(settings, 'backupPath', 'backup_path')),
    backupEndpoint: toStringValue(pickSetting(settings, 'backupEndpoint', 'backup_endpoint')),
    backupBucket: toStringValue(pickSetting(settings, 'backupBucket', 'backup_bucket')),
  };
}
