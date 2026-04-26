import type { APIRoute } from 'astro';
import {
  buildBackendTelegramPayload,
  json,
  loadTelegramBotToken,
  parseMessageId,
  parseJsonResponse,
  proxyTelegramSendToBackend,
  sendTelegramMessage,
  type TelegramSendBody,
} from '../../../lib/telegram-send-route-helpers.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as TelegramSendBody;
  const shopSlug = String(body.shopSlug || body.shop_slug || '').trim();
  const chatId = String(body.chatId || body.chat_id || '').trim();
  const messageId = parseMessageId(body.messageId ?? body.message_id);
  const text = String(body.text || '').trim();
  const inlineTelegramBotToken = String(body.telegramBotToken || body.telegram_bot_token || '').trim();
  const numericShopSlug = /^\d+$/.test(shopSlug);

  if (!chatId || !text) {
    return json({ success: false, error: 'invalid_send_request' }, 400);
  }

  let token = '';
  try {
    const tokenResult = await loadTelegramBotToken(request, shopSlug, inlineTelegramBotToken);
    token = tokenResult.token;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shop_info_failed';
    return json({ success: false, error: message }, 502);
  }

  const telegramPayload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  let mode: 'send' | 'edit' = 'send';

  if (messageId > 0) {
    telegramPayload.message_id = messageId;
    mode = 'edit';
  }
  const replyMarkup = body.replyMarkup ?? body.reply_markup;
  if (replyMarkup && typeof replyMarkup === 'object' && !Array.isArray(replyMarkup)) {
    telegramPayload.reply_markup = replyMarkup;
  }
  const parseMode = body.parseMode ?? body.parse_mode;
  if (typeof parseMode === 'string' && parseMode.trim()) {
    telegramPayload.parse_mode = parseMode.trim();
  }
  const disableWebPagePreview = body.disableWebPagePreview ?? body.disable_web_page_preview;
  if (typeof disableWebPagePreview === 'boolean') {
    telegramPayload.disable_web_page_preview = disableWebPagePreview;
  }

  if (!token) {
    return proxyTelegramSendToBackend(
      request,
      buildBackendTelegramPayload(shopSlug, numericShopSlug, telegramPayload),
    );
  }

  let telegramRes: Response;
  try {
    telegramRes = await sendTelegramMessage(token, telegramPayload, mode);
  } catch {
    return proxyTelegramSendToBackend(
      request,
      buildBackendTelegramPayload(shopSlug, numericShopSlug, telegramPayload, token),
    );
  }

  const responseText = await telegramRes.text();
  const parsed = parseJsonResponse(responseText);

  if (!telegramRes.ok || parsed.ok === false) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      telegram_status: telegramRes.status,
      telegram_response: parsed.ok === false ? parsed : responseText,
    }, 502);
  }

  return json({
    success: true,
    ...parsed,
  });
};
