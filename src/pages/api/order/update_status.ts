import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { readOnlineRiders } from '../../../lib/rider-assignment.ts';
import { buildDispatchMetaRemarks, buildRiderOrderView, readDispatchMetaFromRemarks, resolveRiderUnifiedStatus } from '../../../lib/rider-dispatch.ts';
import { buildRiderSingleMessageTelegram, buildTelegramEditMessagePayload, buildTelegramShortClaimCallback } from '../../../lib/telegram-dispatch.ts';
import { buildForwardHeaders, readOrderDetail, readTelegramItemSummaryFromOrder, writeOrderDispatchRemarks } from '../../../lib/rider-route-shared.ts';

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

function readTelegramMessageRefFromResponse(body: Record<string, unknown>, fallbackChatId = ''): { chatId: string; messageId: number } | null {
  const result = body.result && typeof body.result === 'object' ? body.result as Record<string, unknown> : null;
  const chatId = String(
    body.chatId
      || body.chat_id
      || result?.chatId
      || result?.chat_id
      || (result?.chat && typeof result.chat === 'object' ? (result.chat as Record<string, unknown>).id : '')
      || fallbackChatId
      || '',
  ).trim();
  const messageId = Number(
    body.messageId
      || body.message_id
      || result?.messageId
      || result?.message_id
      || 0,
  );
  return chatId && Number.isInteger(messageId) && messageId > 0 ? { chatId, messageId } : null;
}

type RiderLookupRow = {
  id?: string | number;
  phone?: string;
  telegramChatId?: string;
  telegram_chat_id?: string;
};

async function readMatchedAvailableRider(
  request: Request,
  apiBaseUrl: string,
  riderPhone: string,
  riderIdText: string,
): Promise<RiderLookupRow | null> {
  const upstream = await fetch(`${apiBaseUrl}/api/rider/status?action=list_available`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;
  const parsed = JSON.parse(text) as unknown;
  const riders = readOnlineRiders(parsed);
  return riders.find((row) => String(row.phone || '').trim() === riderPhone)
    || riders.find((row) => String(row.id || '').trim() === riderIdText)
    || null;
}

async function readRiderByPhone(
  request: Request,
  apiBaseUrl: string,
  riderPhone: string,
): Promise<RiderLookupRow | null> {
  const phone = String(riderPhone || '').trim();
  if (!phone) return null;

  const upstream = await fetch(`${apiBaseUrl}/api/rider/status?phone=${encodeURIComponent(phone)}`, {
    headers: buildForwardHeaders(request),
  });
  const text = await upstream.text();
  if (!upstream.ok || !text) return null;

  const parsed = JSON.parse(text) as unknown;
  const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  const rider = root?.rider && typeof root.rider === 'object' ? root.rider as Record<string, unknown> : null;
  if (!rider) return null;

  return {
    id: typeof rider.id === 'string' || typeof rider.id === 'number' ? rider.id : undefined,
    phone: String(rider.phone || '').trim() || undefined,
    telegramChatId: String(rider.telegramChatId || '').trim() || undefined,
    telegram_chat_id: String(rider.telegram_chat_id || '').trim() || undefined,
  };
}

async function syncTelegramRiderMessageAfterStatusUpdate(
  request: Request,
  orderId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const nextStatus = String(payload.status || '').trim();
  if (nextStatus !== 'picked_up' && nextStatus !== 'completed') return;

  const payloadRiderPhone = String(payload.courierPhone || payload.courier_phone || '').trim();
  const payloadRiderName = String(payload.courierName || payload.courier_name || '').trim();

  const apiBaseUrl = readApiBaseUrl();
  const order = await readOrderDetail(request, apiBaseUrl, orderId, payloadRiderPhone);
  if (!order) return;

  const riderPhone = payloadRiderPhone || String(order.courierPhone || order.courier_phone || '').trim();
  const riderName = payloadRiderName || String(order.courierName || order.courier_name || '').trim();
  if (!riderPhone || !riderName) return;

  const remarksJson = String(order.remarksJson || order.remarks_json || '').trim();
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const initialRiderId = Number(
    payload.riderId
      || payload.rider_id
      || order.courierId
      || order.courier_id
      || meta.currentRiderId
      || 0,
  );
  let riderId = Number.isInteger(initialRiderId) && initialRiderId > 0 ? initialRiderId : 0;
  let riderIdText = riderId > 0 ? String(riderId) : '';
  const matchedAvailableRider = await readMatchedAvailableRider(request, apiBaseUrl, riderPhone, riderIdText);
  const matchedRider = matchedAvailableRider || await readRiderByPhone(request, apiBaseUrl, riderPhone);
  if (riderId <= 0) {
    const fallbackRiderId = Number(matchedRider?.id || 0);
    if (Number.isInteger(fallbackRiderId) && fallbackRiderId > 0) {
      riderId = fallbackRiderId;
      riderIdText = String(fallbackRiderId);
    }
  }
  const shopSlug = readOrderShopSlug(order, payload.shopSlug || payload.shop_slug);
  const messageRef = meta.telegramMessageRef;
  const targetChatId = messageRef?.chatId || String(matchedRider?.telegramChatId || matchedRider?.telegram_chat_id || '').trim();
  if (!targetChatId) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: nextStatus,
    remarksJson,
    courierPhone: riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: nextStatus,
    remarksJson,
    courierPhone: riderPhone,
  }, {
    riderId: riderIdText,
    riderPhone,
  });
  const action = unifiedStatus.primaryAction === '送达' ? 'complete' : 'picked_up';
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug && Number.isInteger(riderId) && riderId > 0
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId,
        riderName,
        riderPhone,
        restaurantId: shopSlug,
        telegramChatId: targetChatId,
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

  const telegramResponse = await fetch(new URL('/api/telegram/send', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(messageRef
      ? {
          ...(shopSlug ? { shopSlug } : {}),
          ...buildTelegramEditMessagePayload({
            chatId: messageRef.chatId,
            messageId: messageRef.messageId,
            text: message.text,
            replyMarkup: message.replyMarkup,
          }),
        }
      : {
          ...(shopSlug ? { shopSlug } : {}),
          chatId: targetChatId,
          text: message.text,
          replyMarkup: message.replyMarkup,
        }),
  });

  if (messageRef) return;

  const telegramText = await telegramResponse.text();
  if (!telegramResponse.ok || !telegramText) return;
  const nextMessageRef = readTelegramMessageRefFromResponse(JSON.parse(telegramText) as Record<string, unknown>, targetChatId);
  if (!nextMessageRef) return;

  await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
    ...meta,
    telegramMessageRef: nextMessageRef,
  })));
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
