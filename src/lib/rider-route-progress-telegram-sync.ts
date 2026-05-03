import { buildForwardHeaders } from './rider-route-admin-telegram-core.ts';
import {
  buildRiderOrderView,
  readDispatchMetaFromRemarks,
  resolveRiderUnifiedStatus,
} from './rider-dispatch.ts';
import {
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
  buildTelegramShortClaimCallback,
} from './telegram-dispatch.ts';
import {
  readOrderDetail,
  readOrderTelegramShopSlug,
  readTelegramItemSummaryFromOrder,
} from './rider-route-progress-order-read.ts';

export async function syncTelegramDeliveryProgressMessage({
  request,
  apiBaseUrl,
  telegramSendUrl,
  orderId,
  rider,
  remarksJson,
  targetStatus,
  fallbackShopSlug,
  fallbackChatId,
  fallbackOrder,
}: {
  request: Request;
  apiBaseUrl: string;
  telegramSendUrl: string | URL;
  orderId: string;
  rider: {
    riderId: string;
    riderName: string;
    riderPhone: string;
  };
  remarksJson: string;
  targetStatus: 'delivering' | 'picked_up' | 'completed';
  fallbackShopSlug?: string;
  fallbackChatId?: string;
  fallbackOrder?: Record<string, unknown> | null;
}): Promise<void> {
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const messageRef = meta.telegramMessageRef;
  if (!messageRef) return;

  const order = fallbackOrder || await readOrderDetail(request, apiBaseUrl, orderId, rider.riderPhone);
  if (!order) return;

  const orderView = buildRiderOrderView({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  });
  const unifiedStatus = resolveRiderUnifiedStatus({
    ...order,
    status: targetStatus,
    remarksJson,
    courierPhone: rider.riderPhone,
  }, {
    riderId: rider.riderId,
    riderName: rider.riderName,
    riderPhone: rider.riderPhone,
  });
  const shopSlug = readOrderTelegramShopSlug(order, fallbackShopSlug);
  const chatId = String(messageRef.chatId || fallbackChatId || '').trim();
  const primaryCallbackData = unifiedStatus.primaryAction && shopSlug
    ? buildTelegramShortClaimCallback({
        orderId: Number(orderId),
        riderId: Number(rider.riderId),
        riderName: rider.riderName,
        riderPhone: rider.riderPhone,
        restaurantId: shopSlug,
        telegramChatId: chatId,
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

  await fetch(telegramSendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify({
      ...(shopSlug ? { shopSlug } : {}),
      ...buildTelegramEditMessagePayload({
        chatId,
        messageId: messageRef.messageId,
        text: message.text,
        replyMarkup: message.replyMarkup,
      }),
    }),
  });

  return;
}
