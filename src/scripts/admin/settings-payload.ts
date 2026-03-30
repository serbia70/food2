export type DeliveryType = 'merchant' | 'platform';

export type BuildSettingsPayloadOptions = {
  deliveryType?: DeliveryType;
  driversJson?: string;
  city?: string;
  zone?: string;
  address?: string;
  mapUrl?: string;
  contactPhone?: string;
  wechatQr?: string;
  menuTextMode?: boolean;
  telegramToken?: string;
  telegramChatId?: string;
  shopName?: string;
  shopCategory?: string;
  shopLogo?: string;
  mqttSecret?: string;
};
function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildAdminSettingsPayload(formData: FormData, options: BuildSettingsPayloadOptions = {}) {
  const deliveryType = options.deliveryType === 'platform' ? 'platform' : 'merchant';

  let drivers: unknown[] = [];
  try {
    drivers = JSON.parse(String(options.driversJson || '[]'));
    if (!Array.isArray(drivers)) drivers = [];
  } catch {
    drivers = [];
  }

  return {
    name: String(options.shopName || '').trim(),
    category: String(options.shopCategory || '').trim(),
    logo: String(options.shopLogo || '').trim(),
    city: String(options.city || '').trim(),
    zone: String(options.zone || '').trim(),
    address: String(options.address || '').trim(),
    mqtt_secret: String(options.mqttSecret || '').trim(),
    menu_text_mode: options.menuTextMode === true,
    currency: {
      wechat_qr: String(options.wechatQr || '').trim(),
    },
    contact: {
      phone: String(options.contactPhone || '').trim(),
      map_url: String(options.mapUrl || '').trim(),
    },
    telegram: {
      token: String(options.telegramToken || '').trim(),
      chat_id: String(options.telegramChatId || '').trim(),
    },
    hours: { open: formData.get('open'), close: formData.get('close') },
    holidays: {
      enabled: formData.get('holiday_enabled') === 'on',
      closed_dates: formData.get('closed_dates'),
      message: formData.get('holiday_message'),
    },
    delivery_type: deliveryType,
    delivery: {
      zones: formData.get('zones'),
      fee: toNumber(formData.get('fee')),
      free_threshold: toNumber(formData.get('free_threshold')),
    },
    print_on_checkout: formData.get('print_on_checkout') === 'on',
    drivers,
  };
}
