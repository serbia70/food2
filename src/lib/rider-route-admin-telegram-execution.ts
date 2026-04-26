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
  buildAdminTelegramSendCallbacks,
  normalizeTelegramSendError,
} from './rider-route-admin-telegram-core.ts';
import { sendPreparedAdminTelegramToRider } from './rider-route-admin-telegram-prepared-send.ts';

export type {
  AdminSingleRiderTelegramResult,
  AdminTelegramPayloadBaseExtras,
  AdminTelegramSendCallbackBase,
  AdminTelegramSendMessage,
} from './rider-route-admin-telegram-core.ts';

export { normalizeTelegramSendError } from './rider-route-admin-telegram-core.ts';
export { sendPreparedAdminTelegramToRider } from './rider-route-admin-telegram-prepared-send.ts';

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

export function buildAdminAssignedOrderMessage(callbacks: {
  claimCallbackData?: string;
  declineCallbackData?: string;
}, input: {
  orderNo: string;
  shopName: string;
  address: string;
  totalAmount: number;
  phone: string;
  pickupEtaMinutes: number;
  scheduledFor?: string;
  itemSummary?: string;
  shopMapUrl?: string;
  deliveryMapUrl?: string;
}): AdminTelegramSendMessage {
  return buildAdminAssignedOrderTelegramMessage({
    ...input,
    claimCallbackData: callbacks.claimCallbackData,
    declineCallbackData: callbacks.declineCallbackData,
  });
}
