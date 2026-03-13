export type DeliveryType = 'merchant' | 'platform';

export type BuildSettingsPayloadOptions = {
  deliveryType?: DeliveryType;
  driversJson?: string;
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildAdminSettingsPayload(formData: FormData, options: BuildSettingsPayloadOptions = {}) {
  const deliveryType = options.deliveryType === 'platform' ? 'platform' : 'merchant';

  let drivers: any[] = [];
  try {
    drivers = JSON.parse(String(options.driversJson || '[]'));
    if (!Array.isArray(drivers)) drivers = [];
  } catch {
    drivers = [];
  }

  return {
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
    print: {
      print_on_checkout: formData.get('print_on_checkout') === 'on',
    },
    drivers,
  };
}
