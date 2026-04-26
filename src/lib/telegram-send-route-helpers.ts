export type TelegramSendBody = {
  shopSlug?: unknown;
  shop_slug?: unknown;
  chatId?: unknown;
  chat_id?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  text?: unknown;
  telegramBotToken?: unknown;
  telegram_bot_token?: unknown;
  replyMarkup?: unknown;
  reply_markup?: unknown;
  parseMode?: unknown;
  parse_mode?: unknown;
  disableWebPagePreview?: unknown;
  disable_web_page_preview?: unknown;
};

export function parseMessageId(raw: unknown): number {
  const normalized = typeof raw === 'number' ? raw : Number.parseInt(String(raw || '').trim(), 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

export { json, parseJsonResponse, sendTelegramMessage } from './telegram-send-transport.ts';
export { loadTelegramBotToken } from './telegram-send-token-resolver.ts';
export { buildBackendTelegramPayload, proxyTelegramSendToBackend } from './telegram-send-backend-proxy.ts';
