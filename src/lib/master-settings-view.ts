type MasterSettingsInput = Record<string, any>;

export type MasterSettingsView = {
  subscriptionFeeRsd: number;
  businessFeeRsd: number;
  subscriptionCommissionType: string;
  subscriptionCommissionValue: number;
  businessCommissionType: string;
  businessCommissionValue: number;
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

function toNumber(value: any, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toType(value: any, fallback: string): string {
  const raw = String(value || '').trim();
  if (raw === 'percentage' || raw === 'per_order') return raw;
  return fallback;
}

function toStringValue(value: any): string {
  return String(value || '').trim();
}

function toNumberAllowZero(value: any, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function toChoice(value: any, allowed: string[], fallback: string): string {
  const raw = String(value || '').trim();
  return allowed.includes(raw) ? raw : fallback;
}

function toJsonString(value: any, fallback: string): string {
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

export function buildMasterSettingsView(settings: MasterSettingsInput): MasterSettingsView {
  return {
    subscriptionFeeRsd: toNumber(settings?.subscription_fee_rsd, 1200),
    businessFeeRsd: toNumber(settings?.business_fee_rsd, 1800),
    subscriptionCommissionType: toType(settings?.subscription_delivery_commission_type, 'percentage'),
    subscriptionCommissionValue: toNumber(settings?.subscription_delivery_commission_value, 3),
    businessCommissionType: toType(settings?.business_delivery_commission_type, 'percentage'),
    businessCommissionValue: toNumber(settings?.business_delivery_commission_value, 3),
    footer: {
      footerText: toStringValue(settings?.footer_text ?? settings?.footerText),
      footerPhone: toStringValue(settings?.footer_phone ?? settings?.footerPhone),
      footerCopyright: toStringValue(settings?.footer_copyright ?? settings?.footerCopyright),
    },
    rate: {
      exchangeRate: toNumberAllowZero(settings?.exchange_rate ?? settings?.exchangeRate, 0),
      displayFinalRate: toNumberAllowZero(settings?.display_final_rate ?? settings?.displayFinalRate, 0),
      rateBase: toNumberAllowZero(settings?.rate_base ?? settings?.rateBase, 0),
      rateOffset: toNumberAllowZero(settings?.rate_offset ?? settings?.rateOffset, 0),
      rateStep: toNumberAllowZero(settings?.rate_step ?? settings?.rateStep, 0),
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
      uploadStrictR2: toBoolean(settings?.upload_strict_r2 ?? settings?.uploadStrictR2),
    },
    server: {
      mqttBroker: toStringValue(settings?.mqtt_broker ?? settings?.mqttBroker),
    },
    categories: {
      categoriesJson: toJsonString(settings?.categories, '[]'),
    },
    backup: {
      backupTime: toStringValue(settings?.backup_time ?? settings?.backupTime),
      backupRetention: toNumberAllowZero(settings?.backup_retention ?? settings?.backupRetention, 7) || 7,
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
