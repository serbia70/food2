export interface ShopDisplaySettings {
  city: string;
  hours: { open: string; close: string };
  hasShopCityOverride: boolean;
  hasShopHoursOverride: boolean;
}

export function resolveShopDisplaySettings(
  shop: unknown,
  shopSettings: unknown,
  masterSettings: unknown
): ShopDisplaySettings {
  const result: ShopDisplaySettings = {
    city: '',
    hours: { open: '', close: '' },
    hasShopCityOverride: false,
    hasShopHoursOverride: false,
  };

  const s = shop as Record<string, unknown> | null | undefined;
  const ss = shopSettings as Record<string, unknown> | null | undefined;
  const ms = masterSettings as Record<string, unknown> | null | undefined;
  const masterDefaults = (ms?.shopDefaults as Record<string, unknown>) || {};
  const legacyMasterOpen = typeof ms?.default_open_time === 'string' ? ms.default_open_time.trim() : '';
  const legacyMasterClose = typeof ms?.default_close_time === 'string' ? ms.default_close_time.trim() : '';

  // Resolve City
  const rawShopCity = (typeof ss?.city === 'string' && ss.city.trim() !== '' ? ss.city : null) ||
                      (typeof s?.city === 'string' ? s.city : null);
  const shopCity = rawShopCity?.trim();

  if (shopCity) {
    result.city = shopCity;
    result.hasShopCityOverride = true;
  } else if (typeof masterDefaults.city === 'string') {
    const masterCity = masterDefaults.city.trim();
    if (masterCity) {
      result.city = masterCity;
    }
  }

  // Resolve Hours
  const shopHours = ss?.hours;
  if (shopHours && typeof shopHours === 'object') {
    const h = shopHours as Record<string, unknown>;
    const open = (typeof h.open === 'string' ? h.open.trim() : '');
    const close = (typeof h.close === 'string' ? h.close.trim() : '');

    if (open && close) {
      result.hours = { open, close };
      result.hasShopHoursOverride = true;
    }
  }

  if (!result.hasShopHoursOverride && masterDefaults.hours && typeof masterDefaults.hours === 'object') {
    const mh = masterDefaults.hours as Record<string, unknown>;
    const open = (typeof mh.open === 'string' ? mh.open.trim() : '');
    const close = (typeof mh.close === 'string' ? mh.close.trim() : '');

    if (open && close) {
      result.hours = { open, close };
    }
  }

  if (!result.hasShopHoursOverride && !result.hours.open && !result.hours.close && legacyMasterOpen && legacyMasterClose) {
    result.hours = { open: legacyMasterOpen, close: legacyMasterClose };
  }

  return result;
}
