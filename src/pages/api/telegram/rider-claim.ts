import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';

export const prerender = false;

interface TelegramClaimBody {
  callbackData?: unknown;
  chatId?: unknown;
}

function readTelegramRequestSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_CALLBACK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_CALLBACK_SECRET || '').trim();
}

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = readTelegramRequestSecret();
  if (!expected) return false;
  const provided = String(
    request.headers.get('x-telegram-bot-api-secret-token')
      || request.headers.get('x-telegram-claim-secret')
      || '',
  ).trim();
  return provided !== '' && provided === expected;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized_telegram_request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let parsedBody: TelegramClaimBody;

  try {
    parsedBody = (await request.json()) as TelegramClaimBody;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const callbackData = String(parsedBody.callbackData || '').trim();
  const chatId = String(parsedBody.chatId || '').trim();
  if (!callbackData) {
    return new Response(JSON.stringify({ success: false, error: 'callback_data_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!chatId) {
    return new Response(JSON.stringify({ success: false, error: 'chat_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let callback;
  try {
    callback = parseTelegramClaimCallback(callbackData);
  } catch (error) {
    const message = error instanceof Error ? String(error.message || '').trim() : '';
    const safeErrors = new Set(['expired_callback', 'invalid_signature']);
    const publicError = safeErrors.has(message) ? message : 'invalid_callback_data';
    return new Response(JSON.stringify({ success: false, error: publicError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const matchedPhone = String(callback.riderPhone || '').trim();
  const matchedName = String(callback.riderName || '').trim();
  const matchedChatId = String(callback.telegramChatId || '').trim();
  if (!matchedPhone || !matchedName || !matchedChatId || matchedChatId !== chatId) {
    return new Response(JSON.stringify({ success: false, error: 'rider_identity_mismatch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(`${new URL(request.url).origin}/api/order/update_status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: callback.orderId,
      expected_current_status: 'awaiting_courier',
      status: 'delivering',
      courier_name: matchedName,
      courier_phone: matchedPhone,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};
