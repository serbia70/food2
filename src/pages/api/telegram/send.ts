import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';

export const prerender = false;

type TelegramSendBody = {
  shop_slug?: unknown;
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

async function loadTelegramBotToken(shopSlug: string): Promise<string> {
  const shopRes = await fetch(`${API_BASE_URL}/${encodeURIComponent(shopSlug)}/info`);
  if (!shopRes.ok) throw new Error(`shop_info_http_${shopRes.status}`);
  const shop = await shopRes.json().catch(() => ({}));
  const settings = parseShopSettings(asRecord(shop).settings);
  const telegram = asRecord(settings.telegram);
  const shopToken = String(telegram.token || '').trim();
  if (shopToken) return shopToken;

  const masterRes = await fetch(`${API_BASE_URL}/api/master/settings`);
  if (!masterRes.ok) throw new Error(`master_settings_http_${masterRes.status}`);
  const masterData = await masterRes.json().catch(() => ({}));
  const masterSettings = asRecord(asRecord(masterData).settings);
  return String(masterSettings.telegram_bot_token || masterSettings.telegramBotToken || '').trim();
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as TelegramSendBody;
  const shopSlug = String(body.shop_slug || '').trim();
  const chatId = String(body.chat_id || '').trim();
  const text = String(body.text || '').trim();

  if (!shopSlug || !chatId || !text) {
    return json({ success: false, error: 'invalid_send_request' }, 400);
  }

  let token = '';
  try {
    token = await loadTelegramBotToken(shopSlug);
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
