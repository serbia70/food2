import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import {
  buildDispatchMetaRemarks,
  buildRiderOrderView,
  readDispatchMetaFromRemarks,
  resolveRiderOrderAction,
  resolveRiderUnifiedStatus,
} from '../../../lib/rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';
import {
  buildForwardHeaders,
  buildUpstreamFailureResponse,
  readOrderDetail,
  readOrderDispatchSnapshot,
  writeOrderDispatchRemarks,
} from '../../../lib/rider-route-shared.ts';

export const prerender = false;

const apiBaseUrl = String(process.env.PUBLIC_API_URL || API_BASE_URL || '').trim().replace(/\/$/, '');
const riderActions = new Set(['accept', 'decline', 'picked_up', 'complete']);

function readTelegramSendShopSlug(value: unknown): string {
  const slug = String(value || '').trim();
  if (!slug || slug === 'admin') return '';
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : '';
}

function readOrderShopSlug(order: Record<string, unknown>): string {
  return readTelegramSendShopSlug(order.shopSlug)
    || readTelegramSendShopSlug(order.slug)
    || readTelegramSendShopSlug(order.restaurantSlug)
    || readTelegramSendShopSlug(order.shop_slug)
    || readTelegramSendShopSlug(order.restaurant_slug);
}

async function syncTelegramRiderMessage(
  request: Request,
  orderId: string,
  riderId: string,
  riderName: string,
  riderPhone: string,
  remarksJson: string,
  targetStatus: 'picked_up' | 'completed',
  fallbackShopSlug = '',
): Promise<void> {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const order = await readOrderDetail(request, apiBaseUrl, orderId, riderPhone);
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
    riderId,
    riderPhone,
  });
  const shopSlug = readOrderShopSlug(order) || readTelegramSendShopSlug(fallbackShopSlug);
  const completeCallbackData = unifiedStatus.primaryAction === '送达' && shopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(riderId),
        riderName,
        riderPhone,
        restaurantId: shopSlug,
        telegramChatId: messageRef.chatId,
        action: 'complete',
      })
    : '';

  const message = buildRiderSingleMessageTelegram({
    orderNo: String(order.orderNo || orderId || '').trim(),
    shopName: orderView.shopName,
    address: orderView.deliveryAddress || '未提供地址',
    phone: String(order.userPhone || '').trim() || '-',
    statusLabel: unifiedStatus.statusLabel,
    acceptedAtLabel: unifiedStatus.acceptedAt,
    pickedUpAtLabel: unifiedStatus.pickedUpAt,
    completedAtLabel: unifiedStatus.completedAt,
    shopMapUrl: orderView.shopMapUrl,
    deliveryMapUrl: orderView.deliveryMapUrl,
    primaryAction: unifiedStatus.primaryAction && completeCallbackData
      ? { text: unifiedStatus.primaryAction, callbackData: completeCallbackData }
      : null,
    secondaryAction: null,
  });

  await fetch(`${apiBaseUrl}/api/telegram/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(shopSlug ? { shopSlug } : {}),
      ...buildTelegramEditMessagePayload({
        chatId: messageRef.chatId,
        messageId: messageRef.messageId,
        text: message.text,
        replyMarkup: message.replyMarkup,
      }),
    }),
  });
}

interface RiderActionBody {
  action?: unknown;
  orderId?: unknown;
  riderId?: unknown;
  riderName?: unknown;
  riderPhone?: unknown;
  shopSlug?: unknown;
}

export const POST: APIRoute = async ({ request }) => {
  let parsedBody: RiderActionBody;

  try {
    parsedBody = await request.json() as RiderActionBody;
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const action = String(parsedBody.action || '').trim();
  const orderId = String(parsedBody.orderId || '').trim();
  const riderId = String(parsedBody.riderId || '').trim();
  const riderName = String(parsedBody.riderName || '').trim();
  const riderPhone = String(parsedBody.riderPhone || '').trim();
  const fallbackShopSlug = readTelegramSendShopSlug(parsedBody.shopSlug);

  if (!riderActions.has(action) || !orderId || !riderId || !riderName || !riderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_rider_action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();
  const orderSnapshot = await readOrderDispatchSnapshot(request, apiBaseUrl, orderId, riderPhone);
  const actionDecision = resolveRiderOrderAction({
    action: action as 'accept' | 'decline' | 'picked_up' | 'complete',
    order: {
      status: orderSnapshot.status || 'awaiting_courier',
      remarksJson: orderSnapshot.remarksJson,
      courierPhone: orderSnapshot.courierPhone || riderPhone,
    },
    riderId,
    riderName,
    riderPhone,
    nowIso,
  });

  if (!actionDecision.allowed) {
    const body: Record<string, unknown> = { success: false, error: actionDecision.error };
    if (actionDecision.reason) body.reason = actionDecision.reason;
    return new Response(JSON.stringify(body), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (actionDecision.feedbackWriteMode === 'admin_remarks') {
    await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, actionDecision.nextRemarksJson);
  }

  const currentMeta = readDispatchMetaFromRemarks(orderSnapshot.remarksJson);
  const nextRemarksJson = action === 'picked_up' || action === 'complete'
    ? JSON.stringify(buildDispatchMetaRemarks(orderSnapshot.remarksJson, {
        ...currentMeta,
        acceptedAt: currentMeta.acceptedAt,
        pickedUpAt: action === 'picked_up' ? nowIso : currentMeta.pickedUpAt,
        completedAt: action === 'complete' ? nowIso : currentMeta.completedAt,
      }))
    : actionDecision.nextRemarksJson;

  const payload: Record<string, unknown> = {
    id: orderId,
    expectedCurrentStatus: actionDecision.expectedCurrentStatus,
    status: actionDecision.targetStatus,
  };

  if (actionDecision.feedbackWriteMode === 'update_status_remarks' || action === 'picked_up' || action === 'complete') {
    payload.remarksJson = nextRemarksJson;
  }
  if (actionDecision.feedbackWriteMode !== 'update_status_remarks') {
    payload.courierName = riderName;
    payload.courierPhone = riderPhone;
  }

  const upstream = await fetch(`${apiBaseUrl}/api/order/update_status/${encodeURIComponent(orderId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();

  if (action === 'picked_up') {
    if (!upstream.ok) {
      return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_status_updated' });
    }
    try {
      await syncTelegramRiderMessage(request, orderId, riderId, riderName, riderPhone, nextRemarksJson, 'picked_up', fallbackShopSlug);
    } catch {
      // 不阻断主流程成功回包
    }
    return new Response(JSON.stringify({ success: true, action: 'picked_up' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'complete') {
    if (!upstream.ok) {
      return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_completed' });
    }
    try {
      await syncTelegramRiderMessage(request, orderId, riderId, riderName, riderPhone, nextRemarksJson, 'completed', fallbackShopSlug);
    } catch {
      // 不阻断主流程成功回包
    }
    return new Response(JSON.stringify({ success: true, action: 'complete' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    return buildUpstreamFailureResponse(upstream, text, { success: false, error: 'order_status_updated' });
  }

  return new Response(JSON.stringify({ success: true, action }), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
