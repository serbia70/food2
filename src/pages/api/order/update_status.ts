import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildRiderOrderView, readDispatchMetaFromRemarks, resolveRiderUnifiedStatus } from '../../../lib/rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from '../../../lib/telegram-dispatch.ts';
import {
  buildForwardHeaders,
  readOrderDetail,
  readTelegramItemSummaryFromOrder,
} from '../../../lib/rider-route-shared.ts';

export const prerender = false;

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

async function syncTelegramRiderMessageForStatusUpdate(
  request: Request,
  orderId: string,
  payload: Record<string, unknown>,
  targetStatus: 'picked_up' | 'completed',
): Promise<void> {
  const payloadRemarksJson = String(payload.remarksJson || '').trim();
  const payloadCourierPhone = String(payload.courierPhone || '').trim();
  const payloadCourierName = String(payload.courierName || '').trim();
  if (!payloadRemarksJson && !payloadCourierPhone && !payloadCourierName) return;

  const initialMeta = payloadRemarksJson ? readDispatchMetaFromRemarks(payloadRemarksJson) : null;
  const order = await readOrderDetail(request, API_BASE_URL, orderId, payloadCourierPhone);
  if (!order) return;

  const remarksJson = String(order.remarksJson || order.remarks_json || payloadRemarksJson).trim();
  if (!remarksJson) return;

  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef || initialMeta?.telegramMessageRef || null;
  if (!messageRef) return;

  const riderId = String(meta.currentRiderId || meta.lastRiderDecision?.riderId || initialMeta?.currentRiderId || initialMeta?.lastRiderDecision?.riderId || '').trim();
  const riderName = String(payloadCourierName || order.courierName || order.courier_name || meta.lastRiderDecision?.riderName || initialMeta?.lastRiderDecision?.riderName || '').trim();
  const riderPhone = String(payloadCourierPhone || order.courierPhone || order.courier_phone || meta.lastRiderDecision?.riderPhone || initialMeta?.lastRiderDecision?.riderPhone || '').trim();
  const shopSlug = readOrderShopSlug(order, payload.shopSlug);

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
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug && riderId && riderName && riderPhone
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(riderId),
        riderName,
        riderPhone,
        restaurantId: shopSlug,
        telegramChatId: messageRef.chatId,
        action: unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up',
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

export async function forwardOrderUpdateStatus(request: Request, routeId?: string): Promise<Response> {
  const body = await request.text();
  const payload = body ? JSON.parse(body) as Record<string, unknown> : {};
  const id = String(routeId || payload.id || '').trim();
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedPayload = body ? { ...payload } : {} as Record<string, unknown>;
  const numericId = Number(id);
  if (Number.isInteger(numericId) && numericId > 0) {
    normalizedPayload.id = numericId;
  }

  const res = await fetch(`${API_BASE_URL}/api/order/update_status/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(normalizedPayload),
  });
  const text = await res.text();

  if (res.ok && (normalizedPayload.status === 'picked_up' || normalizedPayload.status === 'completed')) {
    try {
      await syncTelegramRiderMessageForStatusUpdate(
        request,
        id,
        normalizedPayload,
        normalizedPayload.status === 'completed' ? 'completed' : 'picked_up',
      );
    } catch {
      // 不阻断主流程成功回包
    }
  }

  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => forwardOrderUpdateStatus(request);
