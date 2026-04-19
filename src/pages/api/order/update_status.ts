import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildRiderOrderView, readDispatchMetaFromRemarks, resolveRiderUnifiedStatus } from '../../../lib/rider-dispatch.ts';
import { buildRiderSingleMessageTelegram, buildTelegramEditMessagePayload, buildTelegramShortClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { buildForwardHeaders, readOrderDetail, readTelegramItemSummaryFromOrder } from '../../../lib/rider-route-shared.ts';

export const prerender = false;

function readApiBaseUrl(): string {
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

async function syncTelegramRiderMessageAfterStatusUpdate(
  request: Request,
  orderId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const nextStatus = String(payload.status || '').trim();
  if (nextStatus !== 'picked_up' && nextStatus !== 'completed') return;

  const riderPhone = String(payload.courierPhone || payload.courier_phone || '').trim();
  const riderName = String(payload.courierName || payload.courier_name || '').trim();
  if (!riderPhone || !riderName) return;

  const apiBaseUrl = readApiBaseUrl();
  const order = await readOrderDetail(request, apiBaseUrl, orderId, riderPhone);
  if (!order) return;

  const remarksJson = String(order.remarksJson || order.remarks_json || '').trim();
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: nextStatus,
    remarksJson,
    courierPhone: riderPhone,
  });
  const riderId = Number(
    payload.riderId
      || payload.rider_id
      || order.courierId
      || order.courier_id
      || meta.currentRiderId
      || 0,
  );
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: nextStatus,
    remarksJson,
    courierPhone: riderPhone,
  }, {
    riderId: Number.isInteger(riderId) && riderId > 0 ? String(riderId) : '',
    riderPhone,
  });
  const shopSlug = readOrderShopSlug(order, payload.shopSlug || payload.shop_slug);
  const action = unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up';
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug && Number.isInteger(riderId) && riderId > 0
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId,
        riderName,
        riderPhone,
        restaurantId: shopSlug,
        telegramChatId: messageRef.chatId,
        action,
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
  const responseText = await res.text();

  if (res.ok) {
    try {
      await syncTelegramRiderMessageAfterStatusUpdate(request, id, normalizedPayload);
    } catch {
      // 不阻断主流程
    }
  }

  return new Response(responseText, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => forwardOrderUpdateStatus(request);
