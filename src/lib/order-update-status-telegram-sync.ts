import { buildDispatchMetaRemarks, buildRiderOrderView, readDispatchMetaFromRemarks, resolveRiderUnifiedStatus } from './rider-dispatch.ts';
import { buildRiderSingleMessageTelegram, buildTelegramEditMessagePayload, buildTelegramShortClaimCallback } from './telegram-dispatch.ts';
import { buildForwardHeaders, readJsonObject, readTelegramMessageRefFromResponse } from './rider-route-admin-telegram-core.ts';
import { readProtectedTelegramCallbackSecret } from './rider-route-admin-state.ts';
import { readOrderDetail, readOrderTelegramShopSlug, readTelegramItemSummaryFromOrder, writeOrderDispatchRemarks } from './rider-route-progress.ts';
import { readMatchedAvailableRider, readRiderByPhone } from './order-update-status-rider-lookup.ts';

export async function syncTelegramRiderMessageAfterStatusUpdate({
  request,
  apiBaseUrl,
  orderId,
  payload,
}: {
  request: Request;
  apiBaseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const nextStatus = String(payload.status || '').trim();
  if (nextStatus !== 'picked_up' && nextStatus !== 'completed') return;

  const payloadRiderPhone = String(payload.courierPhone || payload.courier_phone || '').trim();
  const payloadRiderName = String(payload.courierName || payload.courier_name || '').trim();
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

  const shopSlug = readOrderTelegramShopSlug(order, payload.shopSlug || payload.shop_slug);
  const callbackSecretOverride = await readProtectedTelegramCallbackSecret(request);
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
        secretOverride: callbackSecretOverride,
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

  const parsedTelegram = readJsonObject(telegramText);
  if (!parsedTelegram) return;

  const nextMessageRef = readTelegramMessageRefFromResponse(parsedTelegram, targetChatId);
  if (!nextMessageRef) return;

  await writeOrderDispatchRemarks(request, apiBaseUrl, orderId, JSON.stringify(buildDispatchMetaRemarks(remarksJson, {
    ...meta,
    telegramMessageRef: nextMessageRef,
  })));
}
