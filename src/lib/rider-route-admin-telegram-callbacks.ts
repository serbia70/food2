import {
  readOptionalTelegramCallbackData,
  readResolvedTelegramChatId,
} from './rider-route-admin-telegram-transport.ts';
import {
  type AdminTelegramSendCallbackBase,
} from './rider-route-admin-telegram-callback-base.ts';

export function buildOptionalAdminTelegramClaimCallbackData({
  callbackBase,
  buildCallback,
}: {
  callbackBase: AdminTelegramSendCallbackBase;
  buildCallback: (callbackBase: AdminTelegramSendCallbackBase) => string;
}): string | undefined {
  if (
    callbackBase.riderId <= 0
    || !callbackBase.riderName
    || !callbackBase.riderPhone
    || !callbackBase.telegramChatId
  ) {
    return undefined;
  }

  const callbackData = readOptionalTelegramCallbackData(() => buildCallback(callbackBase));
  return callbackData || undefined;
}

export function buildAdminTelegramSendCallbacks({
  rider,
  fallbackChatId,
  callbackBase,
  builders,
}: {
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown };
  fallbackChatId?: string;
  callbackBase: AdminTelegramSendCallbackBase;
  builders: {
    claimCallbackData?: (callbackBase: AdminTelegramSendCallbackBase) => string;
    declineCallbackData?: (callbackBase: AdminTelegramSendCallbackBase) => string;
  };
}): { chatId: string; claimCallbackData?: string; declineCallbackData?: string } | { error: 'telegram_chat_id_missing' } {
  const chatId = readResolvedTelegramChatId(rider, fallbackChatId);
  if (!chatId) return { error: 'telegram_chat_id_missing' };

  const callbackBaseWithChatId = {
    ...callbackBase,
    telegramChatId: chatId,
  };
  const claimCallbackData = builders.claimCallbackData
    ? buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: callbackBaseWithChatId,
      buildCallback: builders.claimCallbackData,
    })
    : undefined;
  const declineCallbackData = builders.declineCallbackData
    ? buildOptionalAdminTelegramClaimCallbackData({
      callbackBase: callbackBaseWithChatId,
      buildCallback: builders.declineCallbackData,
    })
    : undefined;

  return {
    chatId,
    ...(claimCallbackData ? { claimCallbackData } : {}),
    ...(declineCallbackData ? { declineCallbackData } : {}),
  };
}
