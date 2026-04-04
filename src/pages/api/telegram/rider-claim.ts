import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { API_BASE_URL } from '../../../config.ts';
import { parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';

export const prerender = false;

interface TelegramClaimBody {
  callbackData?: unknown;
  chatId?: unknown;
}

function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || rider.telegram_chat_id || '').trim();
}

async function readRiderIdentityByChatId(request: Request, chatId: string): Promise<{ riderName: string; riderPhone: string } | null> {
  const upstream = await fetch(`${new URL(request.url).origin}/api/rider/status?action=list_available`, {
    headers: {
      cookie: request.headers.get('cookie') || '',
      authorization: request.headers.get('authorization') || '',
    },
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;
  const parsed = readJsonObject(text);
  if (!parsed) return null;
  const riders = readOnlineRiders(parsed.riders);
  const matched = riders.find((rider) => readRiderChatId(rider) === chatId);
  if (!matched) return null;
  const riderName = String(matched.name || '').trim();
  const riderPhone = String(matched.phone || '').trim();
  if (!riderName || !riderPhone) return null;
  return { riderName, riderPhone };
}

function readTelegramRequestSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_CALLBACK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_CALLBACK_SECRET || '').trim();
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = readTelegramRequestSecret();
  if (!expected) return false;
  const provided = String(
    request.headers.get('x-telegram-bot-api-secret-token')
      || request.headers.get('x-telegram-claim-secret')
      || '',
  ).trim();
  return provided !== '' && safeEqualText(provided, expected);
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
    callback = parseTelegramClaimCallback(callbackData, { chatId });
  } catch (error) {
    const firstError = error instanceof Error ? String(error.message || '').trim() : '';

    if (firstError === 'rider_identity_mismatch') {
      const riderIdentity = await readRiderIdentityByChatId(request, chatId);
      try {
        callback = parseTelegramClaimCallback(callbackData, {
          chatId,
          riderName: riderIdentity?.riderName,
          riderPhone: riderIdentity?.riderPhone,
        });
      } catch (secondError) {
        const message = secondError instanceof Error ? String(secondError.message || '').trim() : '';
        const safeErrors = new Set(['expired_callback', 'invalid_signature', 'rider_identity_mismatch']);
        const publicError = safeErrors.has(message) ? message : 'invalid_callback_data';
        return new Response(JSON.stringify({ success: false, error: publicError }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      const safeErrors = new Set(['expired_callback', 'invalid_signature', 'rider_identity_mismatch']);
      const publicError = safeErrors.has(firstError) ? firstError : 'invalid_callback_data';
      return new Response(JSON.stringify({ success: false, error: publicError }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
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

  const riderIdentity = await readRiderIdentityByChatId(request, chatId);
  const resolvedName = String(riderIdentity?.riderName || matchedName).trim();
  const resolvedPhone = String(riderIdentity?.riderPhone || matchedPhone).trim();
  if (!resolvedName || !resolvedPhone) {
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
      courier_name: resolvedName,
      courier_phone: resolvedPhone,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};
