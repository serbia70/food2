import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { fetchProtectedAdminMasterSettings } from '../../../lib/admin-master-settings.ts';

export const prerender = false;

type TelegramSendBody = {
  shopSlug?: unknown;
  shop_slug?: unknown;
  chatId?: unknown;
  chat_id?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  text?: unknown;
  telegramBotToken?: unknown;
  telegram_bot_token?: unknown;
  replyMarkup?: unknown;
  reply_markup?: unknown;
  parseMode?: unknown;
  parse_mode?: unknown;
  disableWebPagePreview?: unknown;
  disable_web_page_preview?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

function describeFetchError(error: unknown): { message: string; cause?: string; code?: string; debugShape?: string } {
  if (error === 'telegram_request_timeout') {
    return {
      message: 'fetch aborted',
      cause: `Telegram request timed out after ${TELEGRAM_SEND_REQUEST_TIMEOUT_MS}ms`,
      code: 'TELEGRAM_REQUEST_TIMEOUT',
    };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'fetch aborted',
      cause: `Telegram request timed out after ${TELEGRAM_SEND_REQUEST_TIMEOUT_MS}ms`,
      code: 'TELEGRAM_REQUEST_TIMEOUT',
    };
  }

  const fallback = {
    message: error instanceof Error ? error.message : 'fetch_failed',
  } as { message: string; cause?: string; code?: string; debugShape?: string };

  if (error instanceof Error) {
    const rawSummary = String(error.stack || `${error.name}: ${error.message}` || '').trim();
    if (rawSummary) fallback.cause = rawSummary.split('\n')[0]?.trim() || rawSummary;
  }

  if (!error || typeof error !== 'object') {
    fallback.debugShape = JSON.stringify({
      primitiveType: typeof error,
      primitiveValue: String(error),
    });
    return fallback;
  }

  const errorRecord = error as Record<string, unknown>;
  const ownKeys = Object.getOwnPropertyNames(errorRecord).slice(0, 12);
  const summary = {
    ctor: errorRecord.constructor && typeof errorRecord.constructor === 'function'
      ? String((errorRecord.constructor as { name?: unknown }).name || '')
      : '',
    ownKeys,
    name: typeof errorRecord.name === 'string' ? errorRecord.name : undefined,
    message: typeof errorRecord.message === 'string' ? errorRecord.message : undefined,
    code: typeof errorRecord.code === 'string' ? errorRecord.code : undefined,
    errno: typeof errorRecord.errno === 'string' || typeof errorRecord.errno === 'number' ? String(errorRecord.errno) : undefined,
    type: typeof errorRecord.type === 'string' ? errorRecord.type : undefined,
    causeType: errorRecord.cause == null ? String(errorRecord.cause) : typeof errorRecord.cause,
  };
  const directCause = typeof errorRecord.cause === 'string' ? errorRecord.cause.trim() : '';
  const directCode = typeof errorRecord.code === 'string' ? errorRecord.code.trim() : '';
  if (directCause) fallback.cause = directCause;
  if (directCode) fallback.code = directCode;

  const cause = errorRecord.cause;
  if (!cause || typeof cause !== 'object') {
    if (!directCause && !directCode) fallback.debugShape = JSON.stringify(summary);
    return fallback;
  }

  const causeRecord = cause as Record<string, unknown>;
  const causeMessage = typeof causeRecord.message === 'string' ? causeRecord.message.trim() : '';
  const code = typeof causeRecord.code === 'string' ? causeRecord.code.trim() : '';

  if (causeMessage) fallback.cause = causeMessage;
  if (code) fallback.code = code;
  if (!directCause && !directCode && !causeMessage && !code) fallback.debugShape = JSON.stringify(summary);
  return fallback;
}

const TELEGRAM_SEND_MAX_ATTEMPTS = 2;
const TELEGRAM_SEND_RETRY_DELAY_MS = 250;
const TELEGRAM_SEND_REQUEST_TIMEOUT_MS = 8000;

function shouldRetryTelegramSend(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const details = describeFetchError(error);
  return details.code === 'UND_ERR_CONNECT_TIMEOUT' || details.code === 'ECONNRESET' || details.code === 'ETIMEDOUT';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMessageId(raw: unknown): number {
  const normalized = typeof raw === 'number' ? raw : Number.parseInt(String(raw || '').trim(), 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

async function postTelegramMessage(
  token: string,
  telegramPayload: Record<string, unknown>,
  mode: 'send' | 'edit',
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('telegram_request_timeout'), TELEGRAM_SEND_REQUEST_TIMEOUT_MS);
  const methodName = mode === 'edit' ? 'editMessageText' : 'sendMessage';
  try {
    return await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramPayload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendTelegramMessage(
  token: string,
  telegramPayload: Record<string, unknown>,
  mode: 'send' | 'edit',
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await postTelegramMessage(token, telegramPayload, mode);
    } catch (error) {
      lastError = error;
      if (!shouldRetryTelegramSend(error) || attempt === TELEGRAM_SEND_MAX_ATTEMPTS) {
        throw error;
      }
      await wait(TELEGRAM_SEND_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('telegram_send_failed');
}

async function loadTelegramBotToken(request: Request, shopSlug: string, inlineToken: string): Promise<{
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

async function proxyTelegramSendToBackend(request: Request, payload: Record<string, unknown>): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/telegram/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      backend_proxy: true,
      ...describeFetchError(error),
    }, 502);
  }

  const text = await upstream.text();
  const parsed = parseJsonResponse(text);
  return json({
    ...(parsed && Object.keys(parsed).length > 0 ? parsed : { success: upstream.ok }),
    ...(parsed.backend_proxy === undefined ? { backend_proxy: true } : {}),
  }, upstream.status);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as TelegramSendBody;
  const shopSlug = String(body.shopSlug || body.shop_slug || '').trim();
  const chatId = String(body.chatId || body.chat_id || '').trim();
  const messageId = parseMessageId(body.messageId ?? body.message_id);
  const text = String(body.text || '').trim();
  const inlineTelegramBotToken = String(body.telegramBotToken || body.telegram_bot_token || '').trim();
  const numericShopSlug = /^\d+$/.test(shopSlug);

  if (!chatId || !text) {
    return json({ success: false, error: 'invalid_send_request' }, 400);
  }

  let token = '';
  let tokenSource: 'shop' | 'master' | 'admin_master' | 'home' | 'missing_after_shop_master_admin_home_fallback' = 'missing_after_shop_master_admin_home_fallback';
  let diagnostics = {
    shopInfo: { requested: false, tokenFound: false },
    masterSettings: { requested: false, status: null as number | null, tokenFound: false },
    adminMasterSettings: { requested: false, status: null as number | null, tokenFound: false, responsePreview: undefined as string | undefined },
    homeSettings: { requested: false, status: null as number | null, tokenFound: false },
  };
  try {
    const tokenResult = await loadTelegramBotToken(request, shopSlug, inlineTelegramBotToken);
    token = tokenResult.token;
    tokenSource = tokenResult.tokenSource;
    diagnostics = tokenResult.diagnostics;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shop_info_failed';
    return json({ success: false, error: message }, 502);
  }

  const telegramPayload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  let mode: 'send' | 'edit' = 'send';

  if (messageId > 0) {
    telegramPayload.message_id = messageId;
    mode = 'edit';
  }
  const replyMarkup = body.replyMarkup ?? body.reply_markup;
  if (replyMarkup && typeof replyMarkup === 'object' && !Array.isArray(replyMarkup)) {
    telegramPayload.reply_markup = replyMarkup;
  }
  const parseMode = body.parseMode ?? body.parse_mode;
  if (typeof parseMode === 'string' && parseMode.trim()) {
    telegramPayload.parse_mode = parseMode.trim();
  }
  const disableWebPagePreview = body.disableWebPagePreview ?? body.disable_web_page_preview;
  if (typeof disableWebPagePreview === 'boolean') {
    telegramPayload.disable_web_page_preview = disableWebPagePreview;
  }

  if (!token) {
    return proxyTelegramSendToBackend(request, {
      ...(!numericShopSlug && shopSlug ? { shopSlug } : {}),
      ...telegramPayload,
    });
  }

  let telegramRes: Response;
  try {
    telegramRes = await sendTelegramMessage(token, telegramPayload, mode);
  } catch (error) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      ...describeFetchError(error),
    }, 502);
  }

  const responseText = await telegramRes.text();
  const parsed = parseJsonResponse(responseText);

  if (!telegramRes.ok || parsed.ok === false) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      telegram_status: telegramRes.status,
      telegram_response: parsed.ok === false ? parsed : responseText,
    }, 502);
  }

  return json({
    success: true,
    ...parsed,
  });
};
