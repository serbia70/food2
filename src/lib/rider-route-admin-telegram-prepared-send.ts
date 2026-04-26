import {
  type AdminSingleRiderTelegramResult,
  type AdminTelegramSendMessage,
  normalizeTelegramSendError,
  readResolvedTelegramChatId,
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
