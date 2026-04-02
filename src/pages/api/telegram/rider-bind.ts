import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { parseRiderTelegramBindToken } from '../../../lib/telegram-rider-bind.ts';

export const prerender = false;

function readTelegramRequestSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(
    env.TELEGRAM_WEBHOOK_SECRET
      || env.TELEGRAM_CALLBACK_SECRET
      || process.env.TELEGRAM_WEBHOOK_SECRET
      || process.env.TELEGRAM_CALLBACK_SECRET
      || '',
  ).trim();
}

function readTelegramBindSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(env.TELEGRAM_BIND_SECRET || process.env.TELEGRAM_BIND_SECRET || '').trim();
}

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = readTelegramRequestSecret();
  const provided = String(request.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  return expected !== '' && provided === expected;
}

function readApiBaseUrl(): string {
  return process.env.PUBLIC_API_URL || API_BASE_URL;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized_telegram_request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  const token = String((body as Record<string, unknown>)?.bindToken || '').trim();
  const chatId = String((body as Record<string, unknown>)?.chatId || '').trim();
  const secret = readTelegramBindSecret();
  if (!token || !chatId || !secret) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_bind_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = parseRiderTelegramBindToken(token, secret);
  } catch {
    return new Response(JSON.stringify({
      success: false,
      error: 'invalid_bind_token',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (Date.parse(payload.expiresAt) < Date.now()) {
    return new Response(JSON.stringify({ success: false, error: 'bind_token_expired' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(`${readApiBaseUrl()}/api/rider/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: payload.riderId, telegram_chat_id: chatId }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};
