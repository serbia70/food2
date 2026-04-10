import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { API_BASE_URL } from '../../../config.ts';
import { buildDispatchMetaRemarks, getRiderDispatchState, readDispatchMetaFromRemarks } from '../../../lib/rider-dispatch.ts';
import { buildRiderDeliveryCompleteTelegramMessage, buildRiderPickedUpTelegramMessage, buildTelegramShortClaimCallback, parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { pickNextAvailableRider, readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
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

function buildUpstreamFailureResponse(
  upstream: Response,
  text: string,
  fallbackBody: Record<string, unknown>,
): Response {
  return new Response(text || JSON.stringify(fallbackBody), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || '').trim();
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

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
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

function hasDispatchMetaConstraints(remarksJson: string, meta: ReturnType<typeof readDispatchMetaFromRemarks>): boolean {
  if (remarksJson.includes('dispatch_meta:')) return true;
  return !!(
    meta.lastRiderDecision
    || meta.declinedRiderIds.length > 0
    || meta.currentRiderId
    || meta.currentAssignedAt
    || meta.currentExpiresAt
    || meta.invalidatedRiderIds.length > 0
    || meta.lastInvalidationReason
  );
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

async function sendDeliveryProgressMessage(
  request: Request,
  callback: ReturnType<typeof parseTelegramClaimCallback>,
  riderName: string,
  riderPhone: string,
  chatId: string,
  stage: 'picked_up' | 'completed',
): Promise<void> {
  const order = await readOrderDetail(request, String(callback.orderId || '').trim(), riderPhone);
  if (!order) return;

  const completeCallbackData = buildTelegramShortClaimCallback({
    orderId: Number(callback.orderId),
    riderId: Number(callback.riderId),
    riderName,
    riderPhone,
    restaurantId: String(callback.restaurantId || 'admin').trim() || 'admin',
    telegramChatId: chatId,
    action: stage === 'picked_up' ? 'picked_up' : 'complete',
  });

  const message = stage === 'picked_up'
    ? buildRiderPickedUpTelegramMessage({
        orderNo: String(order.orderNo || callback.orderId || '').trim(),
        address: String(order.tableInfo || '').trim() || '未提供地址',
        phone: String(order.userPhone || '').trim() || '-',
        totalAmount: Number(order.totalAmount || 0) || 0,
        pickupEtaMinutes: Number(order.pickupEtaMinutes || 0) || 0,
        completeCallbackData,
      })
    : buildRiderDeliveryCompleteTelegramMessage({
        orderNo: String(order.orderNo || callback.orderId || '').trim(),
        address: String(order.tableInfo || '').trim() || '未提供地址',
        phone: String(order.userPhone || '').trim() || '-',
        totalAmount: Number(order.totalAmount || 0) || 0,
        pickupEtaMinutes: Number(order.pickupEtaMinutes || 0) || 0,
        completeCallbackData,
      });

  const notifyShopSlug = readTelegramSendShopSlug(callback.restaurantId);
  await fetch(`${readInternalApiBaseUrl()}/api/telegram/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(notifyShopSlug ? { shopSlug: notifyShopSlug } : {}),
      chatId,
      text: message.text,
      reply_markup: message.replyMarkup,
    }),
  });
}

async function readOrderDispatchSnapshot(
  request: Request,
  orderId: string,
): Promise<{ status: string; remarksJson: string }> {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return { status: '', remarksJson: '' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { status: '', remarksJson: '' };
  }

  const rows = Array.isArray(parsed) ? parsed : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  if (!matched || typeof matched !== 'object') return { status: '', remarksJson: '' };
  return {
    status: String((matched as Record<string, unknown>).status || '').trim(),
    remarksJson: String((matched as Record<string, unknown>).remarksJson || '').trim(),
  };
}

async function readOrderDispatchMeta(request: Request, orderId: string): Promise<string> {
  return (await readOrderDispatchSnapshot(request, orderId)).remarksJson;
}

async function readOrderDetailFromAdminOrders(request: Request, orderId: string): Promise<Record<string, unknown> | null> {
  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/admin/orders`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }

  const rows = Array.isArray(parsed) ? parsed : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object' ? matched as Record<string, unknown> : null;
}

async function readOrderDetailFromRiderOrders(request: Request, orderId: string, riderPhone: string): Promise<Record<string, unknown> | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/rider/orders?phone=${encodeURIComponent(phone)}&view=active`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const parsed = readJsonObject(text);
  const rows = Array.isArray(parsed?.orders) ? parsed.orders : [];
  const matched = rows.find((row) => String((row as Record<string, unknown>)?.id || '').trim() === orderId);
  return matched && typeof matched === 'object' ? matched as Record<string, unknown> : null;
}

async function readOrderDetail(request: Request, orderId: string, riderPhone = ''): Promise<Record<string, unknown> | null> {
  return await readOrderDetailFromAdminOrders(request, orderId)
    || await readOrderDetailFromRiderOrders(request, orderId, riderPhone);
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
  const riderIdText = String(callback.riderId || '').trim();
  const nowIso = new Date().toISOString();
  const orderSnapshot = await readOrderDispatchSnapshot(request, orderIdText);
  const existingMeta = readDispatchMetaFromRemarks(orderSnapshot.remarksJson);
  const dispatchState = getRiderDispatchState(
    {
      status: orderSnapshot.status || 'awaiting_courier',
      courierPhone: resolvedPhone,
    },
    existingMeta,
    riderIdText,
    nowIso,
  );

  const enforceDispatchConstraints = hasDispatchMetaConstraints(orderSnapshot.remarksJson, existingMeta);
  const isDeclineAction = callback.action === 'decline';
  const isPickedUpAction = callback.action === 'picked_up';
  const isCompleteAction = callback.action === 'complete';
  const isDeliveryProgressAction = isPickedUpAction || isCompleteAction;
  const orderStatus = String(orderSnapshot.status || '').trim();

  if (isDeliveryProgressAction) {
    if (orderStatus === 'completed') {
      return new Response(JSON.stringify({ success: false, error: 'order_completed' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expectedOrderStatus = isPickedUpAction ? 'delivering' : 'picked_up';
    if (orderStatus && orderStatus !== expectedOrderStatus) {
      return new Response(JSON.stringify({ success: false, error: 'order_status_updated' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (dispatchState.invalidReason) {
    return new Response(JSON.stringify({ success: false, error: 'dispatch_invalidated', reason: dispatchState.invalidReason }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const actionAllowed = isDeclineAction
    ? dispatchState.canDecline
    : isDeliveryProgressAction
      ? dispatchState.canComplete
      : dispatchState.canAccept;
  if ((isDeliveryProgressAction || enforceDispatchConstraints) && !actionAllowed) {
    return new Response(JSON.stringify({ success: false, error: 'dispatch_invalidated', reason: '已改派' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isDeclineAction) {
    const declinedRiderIds = Array.from(new Set([
      ...existingMeta.declinedRiderIds,
      riderIdText,
    ].filter(Boolean)));
    const invalidatedRiderIds = Array.from(new Set([
      ...existingMeta.invalidatedRiderIds,
      riderIdText,
    ].filter(Boolean)));

    const nextRemarks = buildDispatchMetaRemarks(orderSnapshot.remarksJson, {
      lastRiderDecision: {
        action: 'declined',
        riderId: riderIdText,
        riderName: resolvedName,
        riderPhone: resolvedPhone,
        at: nowIso,
      },
      declinedRiderIds,
      currentRiderId: '',
      currentAssignedAt: '',
      currentExpiresAt: '',
      invalidatedRiderIds,
      lastInvalidationReason: 'declined',
    });
    const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(orderIdText)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: callback.orderId,
        expectedCurrentStatus: 'awaiting_courier',
        status: 'awaiting_courier',
        remarksJson: JSON.stringify(nextRemarks),
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(text || JSON.stringify({ success: false, error: 'decline_feedback_failed' }), {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
      });
    }

    let reassigned = false;
    try {
      const riderListUpstream = await fetch(`${readInternalApiBaseUrl()}/api/rider/status?action=list_available`, {
        headers: buildForwardHeaders(request),
      });
      const riders = readOnlineRiders((readJsonObject(await riderListUpstream.text()) || {}).riders);
      const nextRider = pickNextAvailableRider({
        riders,
        lastAssignedRiderId: riderIdText,
        excludedRiderIds: Array.from(new Set([...declinedRiderIds, ...invalidatedRiderIds])),
      });

      if (nextRider) {
        const redispatch = await fetch(`${readInternalApiBaseUrl()}/api/admin/rider-dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildForwardHeaders(request),
          },
          body: JSON.stringify({
            orderId: callback.orderId,
            action: 'publish',
            forceRiderId: String(nextRider.id || '').trim(),
          }),
        });
        reassigned = redispatch.ok;
      }
    } catch {
      reassigned = false;
    }

    console.info('[telegram/rider-claim:decline]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      riderName: resolvedName,
      riderPhone: resolvedPhone,
      chatId,
      feedbackWritten: true,
      reassigned,
    }));
    return new Response(JSON.stringify({ success: true, action: 'decline', reassigned }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updatePayload = isPickedUpAction
    ? {
        id: callback.orderId,
        expectedCurrentStatus: 'delivering',
        status: 'picked_up',
        courierName: resolvedName,
        courierPhone: resolvedPhone,
      }
    : isCompleteAction
      ? {
          id: callback.orderId,
          expectedCurrentStatus: 'picked_up',
          status: 'completed',
          courierName: resolvedName,
          courierPhone: resolvedPhone,
        }
      : {
          id: callback.orderId,
          expectedCurrentStatus: 'awaiting_courier',
          status: 'delivering',
          courierName: resolvedName,
          courierPhone: resolvedPhone,
        };

  const feedbackWritten = isPickedUpAction || isCompleteAction
    ? true
    : await writeOrderDispatchMeta(request, orderIdText, {
        lastRiderDecision: {
          action: 'accepted',
          riderId: riderIdText,
          riderName: resolvedName,
          riderPhone: resolvedPhone,
          at: nowIso,
        },
        declinedRiderIds: [],
        currentRiderId: riderIdText,
        currentAssignedAt: existingMeta.currentAssignedAt,
        currentExpiresAt: existingMeta.currentExpiresAt,
        invalidatedRiderIds: existingMeta.invalidatedRiderIds,
        lastInvalidationReason: existingMeta.lastInvalidationReason,
      });

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(String(callback.orderId || '').trim())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  });

  const text = await upstream.text();
  if (!feedbackWritten) {
    console.warn('[telegram/rider-claim:feedback-write-skipped]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      chatId,
    }));
  }
  if (upstream.ok) {
    try {
      if (isPickedUpAction) {
        await sendDeliveryProgressMessage(request, callback, resolvedName, resolvedPhone, chatId, 'completed');
      } else if (!isCompleteAction) {
        await sendDeliveryProgressMessage(request, callback, resolvedName, resolvedPhone, chatId, 'picked_up');
      }
    } catch {
      // 不阻断接单成功回包
    }
  }

  if (isPickedUpAction) {
    if (!upstream.ok) {
      return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_status_updated' });
    }
    return new Response(JSON.stringify({ success: true, action: 'picked_up' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (isCompleteAction) {
    if (!upstream.ok) {
      return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_completed' });
    }
    return new Response(JSON.stringify({ success: true, action: 'complete' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
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
