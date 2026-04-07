import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { API_BASE_URL } from '../../../config.ts';
import { buildDispatchMetaRemarks, readDispatchMetaFromRemarks } from '../../../lib/rider-dispatch.ts';
import { parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
import { readTelegramRequestSecret } from '../../../lib/telegram-secrets.ts';

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

function buildForwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
  const authorization = request.headers.get('authorization') || '';
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

function readInternalApiBaseUrl(): string {
  return String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
}

async function readRiderIdentityByChatId(request: Request, chatId: string): Promise<{ riderName: string; riderPhone: string } | null> {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/rider/status?action=list_available`, {
    headers: buildForwardHeaders(request),
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

async function readOrderDispatchMeta(request: Request, orderId: string): Promise<string> {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return '';
  const parsed = JSON.parse(text) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object'
    ? String((matched as Record<string, unknown>).remarksJson || (matched as Record<string, unknown>).remarks_json || '').trim()
    : '';
}

async function writeOrderDispatchMeta(
  request: Request,
  orderId: string,
  nextMeta: Parameters<typeof buildDispatchMetaRemarks>[1],
): Promise<boolean> {
  try {
    const existingRemarks = await readOrderDispatchMeta(request, orderId);
    const upstream = await fetch(`${readInternalApiBaseUrl()}/api/admin/orders/remarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildForwardHeaders(request),
      },
      body: JSON.stringify({
        orderId,
        remarks: buildDispatchMetaRemarks(existingRemarks, nextMeta),
      }),
    });
    return upstream.ok;
  } catch {
    return false;
  }
}

export async function handleTelegramRiderClaim(request: Request): Promise<Response> {
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

  const orderIdText = String(callback.orderId || '').trim();
  const existingMeta = readDispatchMetaFromRemarks(await readOrderDispatchMeta(request, orderIdText));

  if (callback.action === 'decline') {
    const nextRemarks = buildDispatchMetaRemarks(await readOrderDispatchMeta(request, orderIdText), {
      lastRiderDecision: {
        action: 'declined',
        riderId: String(callback.riderId || '').trim(),
        riderName: resolvedName,
        riderPhone: resolvedPhone,
        at: new Date().toISOString(),
      },
      declinedRiderIds: Array.from(new Set([
        ...existingMeta.declinedRiderIds,
        String(callback.riderId || '').trim(),
      ].filter(Boolean))),
    });
    const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(orderIdText)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: callback.orderId,
        expected_current_status: 'awaiting_courier',
        status: 'awaiting_courier',
        remarks_json: JSON.stringify(nextRemarks),
      }),
    });
    const feedbackWritten = upstream.ok;
    console.info('[telegram/rider-claim:decline]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      riderName: resolvedName,
      riderPhone: resolvedPhone,
      chatId,
      feedbackWritten,
    }));
    return new Response(JSON.stringify({ success: true, action: 'decline' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const feedbackWritten = await writeOrderDispatchMeta(request, orderIdText, {
    lastRiderDecision: {
      action: 'accepted',
      riderId: String(callback.riderId || '').trim(),
      riderName: resolvedName,
      riderPhone: resolvedPhone,
      at: new Date().toISOString(),
    },
    declinedRiderIds: [],
  });

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(String(callback.orderId || '').trim())}`, {
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
  if (!feedbackWritten) {
    console.warn('[telegram/rider-claim:feedback-write-skipped]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      chatId,
    }));
  }
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized_telegram_request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return handleTelegramRiderClaim(request);
};
