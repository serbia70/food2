type AdminBrowserLeaf = string | number | boolean | null | undefined;

type AdminBrowserNode =
  | AdminBrowserLeaf
  | AdminBrowserNode[]
  | { [key: string]: AdminBrowserNode };

const TOP_LEVEL_BROWSER_SETTING_KEYS = [
  'mqttBroker',
  'mqtt_broker',
  'menu_layout',
  'menuTextMode',
  'category',
  'name',
  'zone',
  'address',
  'printOnCheckout',
] as const;

const NESTED_BROWSER_SETTING_KEYS = {
  contact: ['phone', 'mapUrl'] as const,
  currency: ['rate', 'wechatQr'] as const,
  telegram: ['chatId'] as const,
  delivery: ['fee', 'freeThreshold', 'zones'] as const,
  holidays: ['enabled', 'closed_dates', 'message'] as const,
  hours: ['open', 'close'] as const,
  server: [] as const,
} as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cloneBrowserValue<T extends AdminBrowserNode>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickNestedObject(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, AdminBrowserNode> {
  const picked: Record<string, AdminBrowserNode> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined) continue;
    if (value && typeof value === 'object') {
      picked[key] = cloneBrowserValue(value as AdminBrowserNode);
      continue;
    }
    picked[key] = value as AdminBrowserNode;
  }
  return picked;
}

export function buildAdminBrowserSettings(input: unknown): Record<string, AdminBrowserNode> {
  const settings = asObject(input);
  const browserSettings: Record<string, AdminBrowserNode> = {};

  for (const key of TOP_LEVEL_BROWSER_SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    if (value && typeof value === 'object') {
      browserSettings[key] = cloneBrowserValue(value as AdminBrowserNode);
      continue;
    }
    browserSettings[key] = value as AdminBrowserNode;
  }

  for (const [section, keys] of Object.entries(NESTED_BROWSER_SETTING_KEYS)) {
    const picked = pickNestedObject(asObject(settings[section]), keys);
    browserSettings[section] = picked;
  }

  return browserSettings;
}
