import { type AdminAssignOrderSummary, type AdminPublishOrderMessageInput } from './rider-route-admin-orders.ts';
import {
  buildAdminAssignedOrderTelegramMessage,
  buildTelegramClaimCallback,
  buildTelegramDispatchMessage,
  buildTelegramShortClaimCallback,
} from './telegram-dispatch.ts';
import {
  type AdminSingleRiderTelegramResult,
  type AdminTelegramPayloadBaseExtras,
  type AdminTelegramSendCallbackBase,
  type AdminTelegramSendMessage,
  buildAdminTelegramCallbackBase,
  buildAdminTelegramPayloadBaseExtras,
  buildAdminTelegramSendCallbacks,
  buildAdminTelegramSendPreparation,
  buildOptionalAdminTelegramClaimCallbackData,
  buildForwardHeaders,
  normalizeTelegramSendError,
  readAdminTelegramSendOutcome,
  readJsonObject,
  readOptionalTelegramCallbackData,
  readResolvedTelegramChatId,
  readTelegramMessageRefFromResponse,
  readTelegramRiderChatId,
  readTelegramSendResult,
  sendAdminTelegramWithReplyMarkupRetry,
} from './rider-route-admin-telegram-core.ts';

export type {
  AdminSingleRiderTelegramResult,
  AdminTelegramPayloadBaseExtras,
  AdminTelegramSendCallbackBase,
  AdminTelegramSendMessage,
} from './rider-route-admin-telegram-core.ts';
export {
  buildAdminTelegramCallbackBase,
  buildAdminTelegramPayloadBaseExtras,
  buildAdminTelegramSendCallbacks,
  buildAdminTelegramSendPreparation,
  buildForwardHeaders,
  buildOptionalAdminTelegramClaimCallbackData,
  normalizeTelegramSendError,
  readAdminTelegramSendOutcome,
  readJsonObject,
  readOptionalTelegramCallbackData,
  readResolvedTelegramChatId,
  readTelegramMessageRefFromResponse,
  readTelegramRiderChatId,
  readTelegramSendResult,
  sendAdminTelegramWithReplyMarkupRetry,
} from './rider-route-admin-telegram-core.ts';

export async function sendPreparedAdminTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  message,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  message: AdminTelegramSendMessage;
}): Promise<AdminSingleRiderTelegramResult> {
  const chatId = readResolvedTelegramChatId(rider, fallbackChatId);
  if (!chatId) return { success: false, error: 'telegram_chat_id_missing' };

  try {
    return await sendAdminTelegramWithReplyMarkupRetry({
      request,
      payloadBase: {
        ...(payloadBaseExtras || {}),
        chat_id: chatId,
        chatId,
        text: message.text,
      },
      replyMarkup: message.replyMarkup,
      chatId,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
}

export async function sendAdminDispatchTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  callbackBase,
  messageInput,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  callbackBase: AdminTelegramSendCallbackBase;
  messageInput: {
    shopName: string;
    address: string;
    totalAmount: number;
    pickupEtaMinutes: number;
    phone: string;
    dashboardLink: string;
    shopMapUrl?: string;
    deliveryMapUrl?: string;
  };
}): Promise<AdminSingleRiderTelegramResult> {
  const callbacks = buildAdminTelegramSendCallbacks({
    rider,
    fallbackChatId,
    callbackBase,
    builders: {
      claimCallbackData: (input) => buildTelegramClaimCallback(input),
    },
  });
  if ('error' in callbacks) return { success: false, error: callbacks.error };

  try {
    const message = buildTelegramDispatchMessage({
      ...messageInput,
      ...(callbacks.claimCallbackData ? { claimCallbackData: callbacks.claimCallbackData } : {}),
    });

    return await sendPreparedAdminTelegramToRider({
      request,
      rider,
      fallbackChatId: callbacks.chatId,
      payloadBaseExtras,
      message,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
}

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

export async function sendAdminTelegramToRider({
  request,
  rider,
  fallbackChatId,
  payloadBaseExtras,
  callbackBase,
  buildMessage,
}: {
  request: Request;
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  payloadBaseExtras?: Record<string, unknown>;
  callbackBase: AdminTelegramSendCallbackBase;
  buildMessage: (callbacks: { claimCallbackData?: string; declineCallbackData?: string }) => AdminTelegramSendMessage;
}): Promise<AdminSingleRiderTelegramResult> {
  const callbacks = buildAdminTelegramSendCallbacks({
    rider,
    fallbackChatId,
    callbackBase,
    builders: {
      claimCallbackData: (input) => buildTelegramShortClaimCallback(input),
      declineCallbackData: (input) => buildTelegramShortClaimCallback({
        ...input,
        action: 'decline',
      }),
    },
  });
  if ('error' in callbacks) return { success: false, error: callbacks.error };

  try {
    const message = buildMessage({
      ...(callbacks.claimCallbackData ? { claimCallbackData: callbacks.claimCallbackData } : {}),
      ...(callbacks.declineCallbackData ? { declineCallbackData: callbacks.declineCallbackData } : {}),
    });

    return await sendPreparedAdminTelegramToRider({
      request,
      rider,
      fallbackChatId: callbacks.chatId,
      payloadBaseExtras,
      message,
    });
  } catch (error) {
    return {
      success: false,
      error: normalizeTelegramSendError(error),
    };
  }
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
    buildMessage: ({ claimCallbackData, declineCallbackData }) => buildAdminAssignedOrderTelegramMessage({
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
      claimCallbackData,
      declineCallbackData,
    }),
  });
}
