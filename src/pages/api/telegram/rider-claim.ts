import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { API_BASE_URL } from '../../../config.ts';
import { buildDispatchMetaRemarks, buildRiderOrderView, readDispatchMetaFromRemarks, resolveRiderOrderAction, resolveRiderUnifiedStatus } from '../../../lib/rider-dispatch.ts';
import {
  buildForwardHeaders,
  buildUpstreamFailureResponse,
  readJsonObject,
  readOrderDetail,
  readTelegramItemSummaryFromOrder,
  writeOrderDispatchRemarks,
} from '../../../lib/rider-route-shared.ts';
import { buildRiderSingleMessageTelegram, buildTelegramEditMessagePayload, buildTelegramShortClaimCallback, parseTelegramClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { pickNextAvailableRider, readOnlineRiders, type AssignableRider } from '../../../lib/rider-assignment.ts';
import { readTelegramRequestSecret } from '../../../lib/telegram-secrets.ts';

export const prerender = false;

interface TelegramClaimBody {
  callbackData?: unknown;
  chatId?: unknown;
}

type TelegramClaimAction = ReturnType<typeof parseTelegramClaimCallback>['action'];

function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || '').trim();
}

function readInternalApiBaseUrl(): string {
  return String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
}

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

function readOrderShopSlug(order: Record<string, unknown>, fallback?: unknown): string {
  return readTelegramSendShopSlug(order.shopSlug)
    || readTelegramSendShopSlug(order.slug)
    || readTelegramSendShopSlug(order.restaurantSlug)
    || readTelegramSendShopSlug(order.shop_slug)
    || readTelegramSendShopSlug(order.restaurant_slug)
    || readTelegramSendShopSlug(order.restaurantId)
    || readTelegramSendShopSlug(order.shopId)
    || readTelegramSendShopSlug(fallback);
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

function resolveTelegramClaimStage(action: TelegramClaimAction): 'delivering' | 'picked_up' | 'completed' | null {
  if (action === 'accept') return 'delivering';
  if (action === 'picked_up') return 'picked_up';
  if (action === 'complete') return 'completed';
  return null;
}

function didRedispatchActuallySucceed(status: number, bodyText: string): boolean {
  if (status < 200 || status >= 300) return false;
  const body = readJsonObject(bodyText);
  if (!body || body.success !== true) return false;

  const telegramDispatch = body.telegram_dispatch;
  if (!telegramDispatch || typeof telegramDispatch !== 'object' || Array.isArray(telegramDispatch)) return false;

  const failedCount = Number(telegramDispatch.failedCount || 0);
  const skippedReason = String(telegramDispatch.skippedReason || '').trim();
  const attempts = Array.isArray(telegramDispatch.attempts) ? telegramDispatch.attempts : [];

  if (failedCount > 0) return false;
  if (skippedReason) return false;
  return attempts.some((attempt) => Boolean(
    attempt
    && typeof attempt === 'object'
    && !Array.isArray(attempt)
    && (attempt as { delivered?: unknown }).delivered === true,
  ));
}

async function editDeliveryProgressMessage(
  request: Request,
  callback: ReturnType<typeof parseTelegramClaimCallback>,
  riderName: string,
  riderPhone: string,
  fallbackChatId: string,
  remarksJson: string,
  targetStatus: 'delivering' | 'picked_up' | 'completed',
  fallbackOrder?: Record<string, unknown> | null,
): Promise<void> {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const order = fallbackOrder || await readOrderDetail(request, readInternalApiBaseUrl(), String(callback.orderId || '').trim(), riderPhone);
  if (!order) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: riderPhone,
  }, {
    riderId: String(callback.riderId || '').trim(),
    riderName,
    riderPhone,
  });
  const realShopSlug = readOrderShopSlug(order, callback.restaurantId);

  const primaryCallbackData = unifiedStatus.primaryAction && realShopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(callback.orderId),
        riderId: Number(callback.riderId),
        riderName,
        riderPhone,
        restaurantId: realShopSlug,
        telegramChatId: fallbackChatId,
        action: unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up',
      })
    : '';

  const message = buildRiderSingleMessageTelegram({
    orderNo: String(order.orderNo || callback.orderId || '').trim(),
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    phone: String(order.userPhone || '').trim() || '-',
    statusLabel: unifiedStatus.statusLabel,
    acceptedAtLabel: unifiedStatus.acceptedAt,
    pickedUpAtLabel: unifiedStatus.pickedUpAt,
    completedAtLabel: unifiedStatus.completedAt,
    itemSummary: readTelegramItemSummaryFromOrder(order),
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
    primaryAction: unifiedStatus.primaryAction && primaryCallbackData
      ? { text: unifiedStatus.primaryAction, callbackData: primaryCallbackData }
      : null,
    secondaryAction: null,
  });

  await fetch(new URL('/api/telegram/send', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(realShopSlug ? { shopSlug: realShopSlug } : {}),
      ...buildTelegramEditMessagePayload({
        chatId: messageRef.chatId || fallbackChatId,
        messageId: messageRef.messageId,
        text: message.text,
        replyMarkup: message.replyMarkup,
      }),
    }),
  });
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
  if (!matchedPhone || !matchedChatId || matchedChatId !== chatId) {
    return new Response(JSON.stringify({ success: false, error: 'rider_identity_mismatch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const riderIdentity = await readRiderIdentityByChatId(request, chatId);
  const resolvedName = String(riderIdentity?.riderName || matchedName || '').trim() || matchedName;
  const resolvedPhone = String(riderIdentity?.riderPhone || matchedPhone || '').trim();
  if (!resolvedPhone) {
    return new Response(JSON.stringify({ success: false, error: 'rider_identity_mismatch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderIdText = String(callback.orderId || '').trim();
  const riderIdText = String(callback.riderId || '').trim();
  const nowIso = new Date().toISOString();
  const progressStage = resolveTelegramClaimStage(callback.action);
  const orderDetailForProgress = await readOrderDetail(request, readInternalApiBaseUrl(), orderIdText, resolvedPhone);
  const currentMeta = readDispatchMetaFromRemarks(String(orderDetailForProgress?.remarksJson || orderDetailForProgress?.remarks_json || ''));
  const nextActionTimes = {
    acceptedAt: currentMeta.acceptedAt,
    pickedUpAt: callback.action === 'picked_up' ? nowIso : currentMeta.pickedUpAt,
    completedAt: callback.action === 'complete' ? nowIso : currentMeta.completedAt,
  };
  const actionDecision = resolveRiderOrderAction({
    action: callback.action,
    order: {
      status: String(orderDetailForProgress?.status || '').trim() || 'awaiting_courier',
      remarksJson: String(orderDetailForProgress?.remarksJson || orderDetailForProgress?.remarks_json || '').trim(),
      courierPhone: String(orderDetailForProgress?.courierPhone || orderDetailForProgress?.courier_phone || '').trim() || resolvedPhone,
    },
    riderId: riderIdText,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    nowIso,
  });
  const isDeclineAction = callback.action === 'decline';

  if (!actionDecision.allowed) {
    const body: Record<string, unknown> = { success: false, error: actionDecision.error };
    if (actionDecision.reason) body.reason = actionDecision.reason;
    return new Response(JSON.stringify(body), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isDeclineAction) {
    const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(orderIdText)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildForwardHeaders(request),
      },
      body: JSON.stringify({
        id: callback.orderId,
        expectedCurrentStatus: actionDecision.expectedCurrentStatus,
        status: actionDecision.targetStatus,
        remarksJson: actionDecision.nextRemarksJson,
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
        excludedRiderIds: actionDecision.excludedRiderIds,
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
        reassigned = didRedispatchActuallySucceed(redispatch.status, await redispatch.text());
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

  const feedbackWritten = actionDecision.feedbackWriteMode !== 'admin_remarks'
    ? true
    : await writeOrderDispatchRemarks(request, readInternalApiBaseUrl(), orderIdText, actionDecision.nextRemarksJson);

  const nextRemarksJson = callback.action === 'picked_up' || callback.action === 'complete'
    ? JSON.stringify(buildDispatchMetaRemarks(String(orderDetailForProgress?.remarksJson || orderDetailForProgress?.remarks_json || ''), {
        ...currentMeta,
        acceptedAt: nextActionTimes.acceptedAt,
        pickedUpAt: nextActionTimes.pickedUpAt,
        completedAt: nextActionTimes.completedAt,
      }))
    : actionDecision.nextRemarksJson;

  const numericOrderId = Number(callback.orderId);
  const updateStatusPayload: Record<string, unknown> = {
    id: Number.isInteger(numericOrderId) && numericOrderId > 0 ? numericOrderId : callback.orderId,
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    status: actionDecision.targetStatus,
  };
  if (actionDecision.feedbackWriteMode === 'update_status_remarks' || callback.action === 'picked_up' || callback.action === 'complete') {
    updateStatusPayload.remarksJson = nextRemarksJson;
  }
  if (actionDecision.feedbackWriteMode !== 'update_status_remarks') {
    updateStatusPayload.courierName = resolvedName;
    updateStatusPayload.courierPhone = resolvedPhone;
  }

  const upstream = await fetch(`${readInternalApiBaseUrl()}/api/order/update_status/${encodeURIComponent(String(callback.orderId || '').trim())}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(updateStatusPayload),
  });

  const text = await upstream.text();
  if (!feedbackWritten) {
    console.warn('[telegram/rider-claim:feedback-write-skipped]', JSON.stringify({
      orderId: callback.orderId,
      riderId: callback.riderId,
      chatId,
    }));
  }
  if (upstream.ok && progressStage) {
    try {
      await editDeliveryProgressMessage(
        request,
        callback,
        resolvedName,
        resolvedPhone,
        chatId,
        nextRemarksJson,
        actionDecision.targetStatus === 'completed'
          ? 'completed'
          : (actionDecision.targetStatus === 'picked_up' ? 'picked_up' : 'delivering'),
        orderDetailForProgress,
      );
    } catch {
      // 不阻断接单成功回包
    }
  }

  if (!upstream.ok) {
    const error = callback.action === 'complete' ? 'order_completed' : 'order_status_updated';
    return buildUpstreamFailureResponse(upstream, text, { success: false, error });
  }

  if (callback.action === 'picked_up' || callback.action === 'complete') {
    return new Response(JSON.stringify({ success: true, action: callback.action }), {
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
