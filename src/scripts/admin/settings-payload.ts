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
    mqttSecret: String(options.mqttSecret || '').trim(),
    menuTextMode: options.menuTextMode === true,
    currency: {
      wechatQr: String(options.wechatQr || '').trim(),
    },
    contact: {
      phone: String(options.contactPhone || '').trim(),
      mapUrl: String(options.mapUrl || '').trim(),
    },
    telegram: {
      token: String(options.telegramToken || '').trim(),
      chatId: String(options.telegramChatId || '').trim(),
    },
    hours: { open: formData.get('open'), close: formData.get('close') },
    holidays: {
      enabled: formData.get('holiday_enabled') === 'on',
      closedDates: formData.get('closed_dates'),
      message: formData.get('holiday_message'),
    },
    deliveryType: deliveryType,
    delivery: {
      zones: formData.get('zones'),
      fee: toNumber(formData.get('fee')),
      freeThreshold: toNumber(formData.get('freeThreshold')),
    },
    printOnCheckout: formData.get('print_on_checkout') === 'on',
    drivers,
  };
}
