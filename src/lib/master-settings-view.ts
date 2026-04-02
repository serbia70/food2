import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';

type MasterSettingsInput = Record<string, unknown>;

export type MasterSettingsView = {
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
  shopDefaults: {
    city: string;
    hours: {
      open: string;
      close: string;
    };
  };
  subscriptionFeeRsd: number;
  businessFeeRsd: number;
  subscriptionCommissionType: string;
  subscriptionCommissionValue: number;
  businessCommissionType: string;
  businessCommissionValue: number;
  defaultShopTier: 'subscription' | 'business';
  defaultShopTierText: '会员版' | '商务版';
  footer: {
    footerText: string;
    footerPhone: string;
    footerCopyright: string;
  };
  rate: {
    exchangeRate: number;
    displayFinalRate: number;
    rateBase: number;
    rateOffset: number;
    rateStep: number;
  };
  wechat: {
    wechatId: string;
    wechatContactQr: string;
    alipayPaymentQr: string;
    wechatPaymentQr: string;
  };
  storage: {
    imageStorage: string;
    r2PublicDomain: string;
    uploadStrictR2: boolean;
  };
  server: {
    mqttBroker: string;
    telegramWebhookSecret: string;
    telegramChatId: string;
    telegramBotToken: string;
  };
  categories: {
    categoriesJson: string;
  };
  backup: {
    backupTime: string;
    backupRetention: number;
    backupTarget: string;
    backupHost: string;
    backupUser: string;
    backupPass: string;
    backupPath: string;
    backupEndpoint: string;
    backupBucket: string;
  };
};

function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const num = toNumber(value, fallback);
  return num > 0 ? num : fallback;
}

function pickSetting(settings: MasterSettingsInput, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in settings) return settings[key];
  }
  return undefined;
}

function pickSettingFromNestedObject(
  settings: MasterSettingsInput,
  parentKeys: string[],
  childKeys: string[],
): unknown {
  for (const parentKey of parentKeys) {
    const parent = settings[parentKey];
    if (!parent || typeof parent !== 'object') continue;
    const parentRecord = parent as Record<string, unknown>;
    for (const childKey of childKeys) {
      if (childKey in parentRecord) return parentRecord[childKey];
    }
  }
  return undefined;
}

function toStringValue(value: unknown): string {
  return String(value ?? '').trim();
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function toDefaultShopTier(value: unknown): 'subscription' | 'business' {
  const raw = String(value ?? '').trim();
  if (raw === 'subscription' || raw === 'business') return raw;
  return 'subscription';
}

function resolveDefaultShopTier(settings: MasterSettingsInput): 'subscription' | 'business' {
  return toDefaultShopTier(pickSetting(settings, 'defaultShopTier', 'default_shop_tier'));
}

function toChoice(value: unknown, allowed: string[], fallback: string): string {
  const raw = String(value ?? '').trim();
  return allowed.includes(raw) ? raw : fallback;
}

function toJsonString(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function buildReservationPlan(settings: MasterSettingsInput): OrderChannelFeePlan {
  return buildOrderChannelFeePlan({
    channel: 'reservation',
    enabled: pickSetting(settings, 'reservationEnabled', 'reservation_enabled'),
    commissionType: pickSetting(settings, 'reservationCommissionType', 'reservation_commission_type'),
    commissionValue: pickSetting(settings, 'reservationCommissionValue', 'reservation_commission_value'),
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 3,
  });
}

function buildDeliveryPlan(settings: MasterSettingsInput): OrderChannelFeePlan {
  return buildOrderChannelFeePlan({
    channel: 'delivery',
    enabled: pickSetting(settings, 'deliveryEnabled', 'delivery_enabled'),
    commissionType: pickSetting(settings, 'deliveryCommissionType', 'delivery_commission_type'),
    commissionValue: pickSetting(settings, 'deliveryCommissionValue', 'delivery_commission_value'),
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 5,
  });
}

export function buildMasterSettingsView(settings: MasterSettingsInput): MasterSettingsView {
  const reservationPlan = buildReservationPlan(settings);
  const deliveryPlan = buildDeliveryPlan(settings);

  const defaultShopTier = resolveDefaultShopTier(settings);

  return {
    reservationPlan,
    deliveryPlan,
    subscriptionFeeRsd: reservationPlan.commissionValue,
    businessFeeRsd: deliveryPlan.commissionValue,
    shopDefaults: {
      city: toStringValue((settings?.shopDefaults as Record<string, unknown> | undefined)?.city),
      hours: {
        open: toStringValue(
          ((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.open,
        ),
        close: toStringValue(
          ((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.close,
        ),
      },
    },
    subscriptionCommissionType: reservationPlan.commissionType,
    subscriptionCommissionValue: reservationPlan.commissionValue,
    businessCommissionType: deliveryPlan.commissionType,
    businessCommissionValue: deliveryPlan.commissionValue,
    defaultShopTier,
    defaultShopTierText: defaultShopTier === 'subscription' ? '会员版' : '商务版',
    footer: {
      footerText: toStringValue(pickSetting(settings, 'footerText', 'footer_text')),
      footerPhone: toStringValue(pickSetting(settings, 'footerPhone', 'footer_phone')),
      footerCopyright: toStringValue(pickSetting(settings, 'footerCopyright', 'footer_copyright')),
    },
    rate: {
      exchangeRate: toNumber(pickSetting(settings, 'exchangeRate', 'exchange_rate'), 0),
      displayFinalRate: toNumber(pickSetting(settings, 'displayFinalRate', 'display_final_rate'), 0),
      rateBase: toNumber(pickSetting(settings, 'rateBase', 'rate_base'), 0),
      rateOffset: toNumber(pickSetting(settings, 'rateOffset', 'rate_offset'), 0),
      rateStep: toNumber(pickSetting(settings, 'rateStep', 'rate_step'), 0),
    },
    wechat: {
      wechatId: toStringValue(pickSetting(settings, 'wechatId', 'wechat_id')),
      wechatContactQr: toStringValue(pickSetting(settings, 'wechatContactQr', 'wechat_contact_qr')),
      alipayPaymentQr: toStringValue(pickSetting(settings, 'alipayPaymentQr', 'alipay_payment_qr')),
      wechatPaymentQr: toStringValue(pickSetting(settings, 'wechatPaymentQr', 'wechat_payment_qr')),
    },
    storage: {
      imageStorage: toChoice(pickSetting(settings, 'imageStorage', 'image_storage'), ['local', 'r2'], 'local'),
      r2PublicDomain: toStringValue(pickSetting(settings, 'r2PublicDomain', 'r2_public_domain')),
      uploadStrictR2: toBoolean(pickSetting(settings, 'uploadStrictR2', 'upload_strict_r2'), false),
    },
    server: {
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
    },
    categories: {
      categoriesJson: toJsonString(settings?.categories, '[]'),
    },
    backup: {
      backupTime: toStringValue(pickSetting(settings, 'backupTime', 'backup_time')),
      backupRetention: toPositiveNumber(pickSetting(settings, 'backupRetention', 'backup_retention'), 7),
      backupTarget: toStringValue(pickSetting(settings, 'backupTarget', 'backup_target')),
      backupHost: toStringValue(pickSetting(settings, 'backupHost', 'backup_host')),
      backupUser: toStringValue(pickSetting(settings, 'backupUser', 'backup_user')),
      backupPass: toStringValue(pickSetting(settings, 'backupPass', 'backup_pass')),
      backupPath: toStringValue(pickSetting(settings, 'backupPath', 'backup_path')),
      backupEndpoint: toStringValue(pickSetting(settings, 'backupEndpoint', 'backup_endpoint')),
      backupBucket: toStringValue(pickSetting(settings, 'backupBucket', 'backup_bucket')),
    },
  };
}
