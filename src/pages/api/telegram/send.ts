import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';

export const prerender = false;

type TelegramSendBody = {
  shopSlug?: unknown;
  shop_slug?: unknown;
  chatId?: unknown;
  chat_id?: unknown;
  text?: unknown;
  reply_markup?: unknown;
  parse_mode?: unknown;
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
  const dataSettings = asRecord(asRecord(settings.data).settings);
  const serverSettings = asRecord(settings.server);
  const dataServerSettings = asRecord(dataSettings.server);
  return String(
    settings.telegram_bot_token
      || settings.telegramBotToken
      || dataSettings.telegram_bot_token
      || dataSettings.telegramBotToken
      || serverSettings.telegram_bot_token
      || serverSettings.telegramBotToken
      || dataServerSettings.telegram_bot_token
      || dataServerSettings.telegramBotToken
      || '',
  ).trim();
}

function describeFetchError(error: unknown): { message: string; cause?: string; code?: string } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'fetch aborted',
      cause: `Telegram request timed out after ${TELEGRAM_SEND_REQUEST_TIMEOUT_MS}ms`,
      code: 'TELEGRAM_REQUEST_TIMEOUT',
    };
  }

  const fallback = {
    message: error instanceof Error ? error.message : 'fetch_failed',
  } as { message: string; cause?: string; code?: string };

  if (!error || typeof error !== 'object') return fallback;

  const errorRecord = error as Record<string, unknown>;
  const cause = errorRecord.cause;
  if (!cause || typeof cause !== 'object') return fallback;

  const causeRecord = cause as Record<string, unknown>;
  const causeMessage = typeof causeRecord.message === 'string' ? causeRecord.message.trim() : '';
  const code = typeof causeRecord.code === 'string' ? causeRecord.code.trim() : '';

  if (causeMessage) fallback.cause = causeMessage;
  if (code) fallback.code = code;
  return fallback;
}

const TELEGRAM_SEND_MAX_ATTEMPTS = 2;
const TELEGRAM_SEND_RETRY_DELAY_MS = 250;
const TELEGRAM_SEND_REQUEST_TIMEOUT_MS = 2000;

function shouldRetryTelegramSend(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const details = describeFetchError(error);
  return details.code === 'UND_ERR_CONNECT_TIMEOUT' || details.code === 'ECONNRESET' || details.code === 'ETIMEDOUT';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTelegramMessage(token: string, telegramPayload: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('telegram_request_timeout'), TELEGRAM_SEND_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramPayload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendTelegramMessage(token: string, telegramPayload: Record<string, unknown>): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await postTelegramMessage(token, telegramPayload);
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

async function loadTelegramBotToken(request: Request, shopSlug: string): Promise<{
  token: string;
  tokenSource: 'shop' | 'master' | 'home' | 'missing_after_shop_master_home_fallback';
  diagnostics: {
    shopInfo: { requested: boolean; tokenFound: boolean };
    masterSettings: { requested: boolean; status: number | null; tokenFound: boolean };
    homeSettings: { requested: boolean; status: number | null; tokenFound: boolean };
  };
}> {
  const diagnostics = {
    shopInfo: { requested: false, tokenFound: false },
    masterSettings: { requested: false, status: null as number | null, tokenFound: false },
    homeSettings: { requested: false, status: null as number | null, tokenFound: false },
  };

  const normalizedShopSlug = String(shopSlug || '').trim();
  if (normalizedShopSlug) {
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

  const masterHeaders: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
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
    tokenSource: 'missing_after_shop_master_home_fallback',
    diagnostics,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as TelegramSendBody;
  const shopSlug = String(body.shopSlug || body.shop_slug || '').trim();
  const chatId = String(body.chatId || body.chat_id || '').trim();
  const text = String(body.text || '').trim();

  if (!chatId || !text) {
    return json({ success: false, error: 'invalid_send_request' }, 400);
  }

  let token = '';
  let tokenSource: 'shop' | 'master' | 'home' | 'missing_after_shop_master_home_fallback' = 'missing_after_shop_master_home_fallback';
  let diagnostics = {
    shopInfo: { requested: false, tokenFound: false },
    masterSettings: { requested: false, status: null as number | null, tokenFound: false },
    homeSettings: { requested: false, status: null as number | null, tokenFound: false },
  };
  try {
    const tokenResult = await loadTelegramBotToken(request, shopSlug);
    token = tokenResult.token;
    tokenSource = tokenResult.tokenSource;
    diagnostics = tokenResult.diagnostics;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shop_info_failed';
    return json({ success: false, error: message }, 502);
  }

  if (!token) {
    return json({
      success: false,
      error: 'telegram_bot_token_not_configured',
      tokenSource,
      diagnostics,
    }, 400);
  }

  const telegramPayload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (body.reply_markup && typeof body.reply_markup === 'object') {
    telegramPayload.reply_markup = body.reply_markup;
  }
  if (typeof body.parse_mode === 'string' && body.parse_mode.trim()) {
    telegramPayload.parse_mode = body.parse_mode.trim();
  }
  if (typeof body.disable_web_page_preview === 'boolean') {
    telegramPayload.disable_web_page_preview = body.disable_web_page_preview;
  }

  let telegramRes: Response;
  try {
    telegramRes = await sendTelegramMessage(token, telegramPayload);
  } catch (error) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      ...describeFetchError(error),
    }, 502);
  }

  const responseText = await telegramRes.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = asRecord(JSON.parse(responseText));
  } catch {
    parsed = {};
  }

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
