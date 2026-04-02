import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';

export const prerender = false;

type TelegramSendBody = {
  shopSlug?: unknown;
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
  const serverSettings = asRecord(settings.server);
  return String(
    settings.telegram_bot_token
      || settings.telegramBotToken
      || serverSettings.telegram_bot_token
      || serverSettings.telegramBotToken
      || '',
  ).trim();
}

async function loadTelegramBotToken(request: Request, shopSlug: string): Promise<string> {
  const normalizedShopSlug = String(shopSlug || '').trim();
  if (normalizedShopSlug) {
    const shopRes = await fetch(`${API_BASE_URL}/${encodeURIComponent(normalizedShopSlug)}/info`);
    if (!shopRes.ok) throw new Error(`shop_info_http_${shopRes.status}`);
    const shop = await shopRes.json().catch(() => ({}));
    const settings = parseShopSettings(asRecord(shop).settings);
    const telegram = asRecord(settings.telegram);
    const shopToken = String(telegram.token || '').trim();
    if (shopToken) return shopToken;
  }

  const passthroughHeaders: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
  const authorization = request.headers.get('authorization') || '';
  if (cookie) passthroughHeaders.cookie = cookie;
  if (authorization) passthroughHeaders.authorization = authorization;

  const masterRes = await fetch(new URL('/api/master/settings', request.url).toString(), {
    method: 'GET',
    ...(Object.keys(passthroughHeaders).length > 0 ? { headers: passthroughHeaders } : {}),
  });
  if (masterRes.ok) {
    const masterData = await masterRes.json().catch(() => ({}));
    const masterToken = readTelegramBotToken(asRecord(masterData).settings);
    if (masterToken) return masterToken;
  }

  const homeRes = await fetch(`${API_BASE_URL}/api/home`);
  if (!homeRes.ok) throw new Error(`home_settings_http_${homeRes.status}`);
  const homeData = await homeRes.json().catch(() => ({}));
  return readTelegramBotToken(asRecord(homeData).settings);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as TelegramSendBody;
  const shopSlug = String(body.shopSlug || '').trim();
  const chatId = String(body.chatId || body.chat_id || '').trim();
  const text = String(body.text || '').trim();

  if (!chatId || !text) {
    return json({ success: false, error: 'invalid_send_request' }, 400);
  }

  let token = '';
  try {
    token = await loadTelegramBotToken(request, shopSlug);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shop_info_failed';
    return json({ success: false, error: message }, 502);
  }

  if (!token) {
    return json({ success: false, error: 'telegram_bot_token_not_configured' }, 400);
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

  const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telegramPayload),
  });

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
