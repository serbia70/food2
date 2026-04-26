import { type AdminAssignOrderSummary, type AdminPublishOrderMessageInput } from './rider-route-admin-orders.ts';
import { buildAdminTelegramSendPreparation } from './rider-route-admin-telegram-core.ts';
import {
  buildAdminAssignedOrderMessage,
  sendAdminDispatchTelegramToRider,
  sendAdminTelegramToRider,
  type AdminSingleRiderTelegramResult,
} from './rider-route-admin-telegram-send.ts';

export async function sendAdminPublishedOrderTelegramToRider({
  request,
  rider,
  fallbackChatId,
  orderId,
  shopSlug,
  telegramBotToken,
  restaurantId,
  callbackSecretOverride,
  messageInput,
}: {
  request: Request;
  rider: { id?: unknown; name?: unknown; phone?: unknown; telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  orderId: string | number;
  shopSlug?: unknown;
  telegramBotToken?: unknown;
  restaurantId?: unknown;
  callbackSecretOverride?: unknown;
  messageInput: AdminPublishOrderMessageInput;
}): Promise<AdminSingleRiderTelegramResult> {
  const prepared = buildAdminTelegramSendPreparation({
    orderId,
    rider,
    fallbackChatId,
    shopSlug,
    telegramBotToken,
    restaurantId,
    secretOverride: callbackSecretOverride,
  });

  return sendAdminDispatchTelegramToRider({
    request,
    rider,
    fallbackChatId: prepared.chatId,
    payloadBaseExtras: prepared.payloadBaseExtras,
    callbackBase: prepared.callbackBase,
    messageInput,
  });
}

export async function sendAdminAssignedOrderTelegramToRider({
  request,
  rider,
  fallbackChatId,
  orderId,
  shopSlug,
  telegramBotToken,
  callbackSecretOverride,
  pickupEtaMinutes,
  orderSummary,
}: {
  request: Request;
  rider: { id?: unknown; name?: unknown; phone?: unknown; telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  orderId: string | number;
  shopSlug?: unknown;
  telegramBotToken?: unknown;
  callbackSecretOverride?: unknown;
  pickupEtaMinutes: number;
  orderSummary: AdminAssignOrderSummary;
}): Promise<AdminSingleRiderTelegramResult> {
  const prepared = buildAdminTelegramSendPreparation({
    orderId,
    rider,
    fallbackChatId,
    shopSlug,
    telegramBotToken,
    restaurantId: shopSlug,
    secretOverride: callbackSecretOverride,
  });

  return sendAdminTelegramToRider({
    request,
    rider,
    fallbackChatId: prepared.chatId,
    payloadBaseExtras: prepared.payloadBaseExtras,
    callbackBase: prepared.callbackBase,
    buildMessage: (callbacks) => buildAdminAssignedOrderMessage(callbacks, {
      orderNo: orderSummary.orderNo,
      shopName: orderSummary.shopName,
      address: orderSummary.address,
      totalAmount: orderSummary.totalAmount,
      phone: orderSummary.phone,
      pickupEtaMinutes,
      scheduledFor: orderSummary.scheduledFor,
      itemSummary: orderSummary.itemSummary,
      shopMapUrl: orderSummary.shopMapUrl,
      deliveryMapUrl: orderSummary.deliveryMapUrl,
    }),
  });
}
