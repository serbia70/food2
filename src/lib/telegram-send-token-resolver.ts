import { API_BASE_URL } from '../config.ts';
import { fetchProtectedAdminMasterSettings } from './admin-master-settings.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseShopSettings(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readTelegramBotToken(raw: unknown): string {
  const settings = asRecord(raw);
  const directSettings = asRecord(settings.settings);
  const data = asRecord(settings.data);
  const dataSettings = asRecord(data.settings);
  const serverSettings = asRecord(settings.server);
  const directServerSettings = asRecord(directSettings.server);
  const dataServerSettings = asRecord(data.server || dataSettings.server);
  const telegramSettings = asRecord(settings.telegram);
  const directTelegramSettings = asRecord(directSettings.telegram);
  const dataTelegramSettings = asRecord(data.telegram || dataSettings.telegram);
  return String(
    settings.telegram_bot_token
      || settings.telegramBotToken
      || telegramSettings.token
      || telegramSettings.telegram_bot_token
      || telegramSettings.telegramBotToken
      || directSettings.telegram_bot_token
      || directSettings.telegramBotToken
      || directTelegramSettings.token
      || directTelegramSettings.telegram_bot_token
      || directTelegramSettings.telegramBotToken
      || dataSettings.telegram_bot_token
      || dataSettings.telegramBotToken
      || dataTelegramSettings.token
      || dataTelegramSettings.telegram_bot_token
      || dataTelegramSettings.telegramBotToken
      || serverSettings.telegram_bot_token
      || serverSettings.telegramBotToken
      || directServerSettings.telegram_bot_token
      || directServerSettings.telegramBotToken
      || dataServerSettings.telegram_bot_token
      || dataServerSettings.telegramBotToken
      || '',
  ).trim();
}

export async function loadTelegramBotToken(request: Request, shopSlug: string, inlineToken: string): Promise<{
  token: string;
  tokenSource: 'shop' | 'master' | 'admin_master' | 'home' | 'missing_after_shop_master_admin_home_fallback';
  diagnostics: {
    shopInfo: { requested: boolean; tokenFound: boolean };
    masterSettings: { requested: boolean; status: number | null; tokenFound: boolean };
    adminMasterSettings: { requested: boolean; status: number | null; tokenFound: boolean; responsePreview?: string };
    homeSettings: { requested: boolean; status: number | null; tokenFound: boolean };
  };
}> {
  const diagnostics = {
    shopInfo: { requested: false, tokenFound: false },
    masterSettings: { requested: false, status: null as number | null, tokenFound: false },
    adminMasterSettings: { requested: false, status: null as number | null, tokenFound: false, responsePreview: undefined as string | undefined },
    homeSettings: { requested: false, status: null as number | null, tokenFound: false },
  };

  const normalizedInlineToken = String(inlineToken || '').trim();
  if (normalizedInlineToken) {
    return { token: normalizedInlineToken, tokenSource: 'shop', diagnostics };
  }

  const normalizedShopSlug = String(shopSlug || '').trim();
  const shouldSkipShopInfoLookup = /^\d+$/.test(normalizedShopSlug);
  if (normalizedShopSlug && !shouldSkipShopInfoLookup) {
    diagnostics.shopInfo.requested = true;
    const shopRes = await fetch(`${API_BASE_URL}/${encodeURIComponent(normalizedShopSlug)}/info`);
    if (!shopRes.ok) throw new Error(`shop_info_http_${shopRes.status}`);
    const shop = await shopRes.json().catch(() => ({}));
    const settings = parseShopSettings(asRecord(shop).settings);
    const telegram = asRecord(settings.telegram);
    const shopToken = String(telegram.token || readTelegramBotToken(settings) || '').trim();
    diagnostics.shopInfo.tokenFound = Boolean(shopToken);
    if (shopToken) {
      return { token: shopToken, tokenSource: 'shop', diagnostics };
    }
  }

  const cookie = request.headers.get('cookie') || '';
  const adminAuthorization = String(request.headers.get('authorization') || '').trim();
  if (adminAuthorization || cookie) {
    diagnostics.adminMasterSettings.requested = true;
    const adminMasterData = await fetchProtectedAdminMasterSettings({
      authorization: adminAuthorization,
      cookie,
    });
    const adminMasterToken = readTelegramBotToken(adminMasterData);
    diagnostics.adminMasterSettings.status = adminMasterToken ? 200 : 204;
    diagnostics.adminMasterSettings.tokenFound = Boolean(adminMasterToken);
    if (adminMasterToken) {
      return { token: adminMasterToken, tokenSource: 'admin_master', diagnostics };
    }
  }

  const masterHeaders: Record<string, string> = {};
  if (cookie) masterHeaders.cookie = cookie;

  diagnostics.masterSettings.requested = true;
  const masterRes = await fetch(new URL('/api/master/init', request.url).toString(), {
    method: 'GET',
    ...(Object.keys(masterHeaders).length > 0 ? { headers: masterHeaders } : {}),
  });
  diagnostics.masterSettings.status = masterRes.status;
  if (masterRes.ok) {
    const masterData = await masterRes.json().catch(() => ({}));
    const masterToken = readTelegramBotToken(masterData);
    diagnostics.masterSettings.tokenFound = Boolean(masterToken);
    if (masterToken) {
      return { token: masterToken, tokenSource: 'master', diagnostics };
    }
  }

  diagnostics.homeSettings.requested = true;
  const homeRes = await fetch(`${API_BASE_URL}/api/home`);
  diagnostics.homeSettings.status = homeRes.status;
  if (!homeRes.ok) throw new Error(`home_settings_http_${homeRes.status}`);
  const homeData = await homeRes.json().catch(() => ({}));
  const homeToken = readTelegramBotToken(homeData);
  diagnostics.homeSettings.tokenFound = Boolean(homeToken);
  if (homeToken) {
    return { token: homeToken, tokenSource: 'home', diagnostics };
  }

  return {
    token: '',
    tokenSource: 'missing_after_shop_master_admin_home_fallback',
    diagnostics,
  };
}
