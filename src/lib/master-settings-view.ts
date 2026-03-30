import { buildOrderChannelFeePlan, type OrderChannelFeePlan } from './order-channel-fees-view.ts';

type MasterSettingsInput = Record<string, unknown>;

export type MasterSettingsView = {
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
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
    enabled: settings?.reservation_enabled,
    commissionType: settings?.reservation_commission_type,
    commissionValue: settings?.reservation_commission_value,
    legacyEnabled: settings?.subscription_enabled,
    legacyCommissionType: settings?.subscription_delivery_commission_type,
    legacyCommissionValue: settings?.subscription_delivery_commission_value,
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 3,
  });
}

function buildDeliveryPlan(settings: MasterSettingsInput): OrderChannelFeePlan {
  return buildOrderChannelFeePlan({
    channel: 'delivery',
    enabled: settings?.delivery_enabled,
    commissionType: settings?.delivery_commission_type,
    commissionValue: settings?.delivery_commission_value,
    legacyEnabled: settings?.business_enabled,
    legacyCommissionType: settings?.business_delivery_commission_type,
    legacyCommissionValue: settings?.business_delivery_commission_value,
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 5,
  });
}

export function buildMasterSettingsView(settings: MasterSettingsInput): MasterSettingsView {
  const reservationPlan = buildReservationPlan(settings);
  const deliveryPlan = buildDeliveryPlan(settings);

  const defaultShopTier = toDefaultShopTier(settings?.default_shop_tier ?? settings?.defaultShopTier);

  return {
    reservationPlan,
    deliveryPlan,
    subscriptionFeeRsd: reservationPlan.commissionValue,
    businessFeeRsd: deliveryPlan.commissionValue,
    subscriptionCommissionType: reservationPlan.commissionType,
    subscriptionCommissionValue: reservationPlan.commissionValue,
    businessCommissionType: deliveryPlan.commissionType,
    businessCommissionValue: deliveryPlan.commissionValue,
    defaultShopTier,
    defaultShopTierText: defaultShopTier === 'subscription' ? '会员版' : '商务版',
    footer: {
      footerText: toStringValue(settings?.footer_text ?? settings?.footerText),
      footerPhone: toStringValue(settings?.footer_phone ?? settings?.footerPhone),
      footerCopyright: toStringValue(settings?.footer_copyright ?? settings?.footerCopyright),
    },
    rate: {
      exchangeRate: toNumber(settings?.exchange_rate ?? settings?.exchangeRate, 0),
      displayFinalRate: toNumber(settings?.display_final_rate ?? settings?.displayFinalRate, 0),
      rateBase: toNumber(settings?.rate_base ?? settings?.rateBase, 0),
      rateOffset: toNumber(settings?.rate_offset ?? settings?.rateOffset, 0),
      rateStep: toNumber(settings?.rate_step ?? settings?.rateStep, 0),
    },
    wechat: {
      wechatId: toStringValue(settings?.wechat_id ?? settings?.wechatId),
      wechatContactQr: toStringValue(settings?.wechat_contact_qr ?? settings?.wechatContactQr),
      alipayPaymentQr: toStringValue(settings?.alipay_payment_qr ?? settings?.alipayPaymentQr),
      wechatPaymentQr: toStringValue(settings?.wechat_payment_qr ?? settings?.wechatPaymentQr),
    },
    storage: {
      imageStorage: toChoice(settings?.image_storage ?? settings?.imageStorage, ['local', 'r2'], 'local'),
      r2PublicDomain: toStringValue(settings?.r2_public_domain ?? settings?.r2PublicDomain),
      uploadStrictR2: toBoolean(settings?.upload_strict_r2 ?? settings?.uploadStrictR2, false),
    },
    server: {
      mqttBroker: toStringValue(settings?.mqtt_broker ?? settings?.mqttBroker),
      telegramWebhookSecret: toStringValue(settings?.telegram_webhook_secret ?? settings?.telegramWebhookSecret),
      telegramChatId: toStringValue(settings?.telegram_chat_id ?? settings?.telegramChatId),
    },
    categories: {
      categoriesJson: toJsonString(settings?.categories, '[]'),
    },
    backup: {
      backupTime: toStringValue(settings?.backup_time ?? settings?.backupTime),
      backupRetention: toPositiveNumber(settings?.backup_retention ?? settings?.backupRetention, 7),
      backupTarget: toStringValue(settings?.backup_target ?? settings?.backupTarget),
      backupHost: toStringValue(settings?.backup_host ?? settings?.backupHost),
      backupUser: toStringValue(settings?.backup_user ?? settings?.backupUser),
      backupPass: toStringValue(settings?.backup_pass ?? settings?.backupPass),
      backupPath: toStringValue(settings?.backup_path ?? settings?.backupPath),
      backupEndpoint: toStringValue(settings?.backup_endpoint ?? settings?.backupEndpoint),
      backupBucket: toStringValue(settings?.backup_bucket ?? settings?.backupBucket),
    },
  };
}
