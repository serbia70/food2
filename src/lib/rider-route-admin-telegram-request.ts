import {
  type AdminSingleRiderTelegramResult,
  readAdminTelegramSendOutcome,
} from './rider-route-admin-telegram-response.ts';

export function buildForwardHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie') || '';
  const authorization = request.headers.get('authorization') || '';
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

export function readTelegramRiderChatId(rider: { telegramChatId?: unknown; telegram_chat_id?: unknown }): string {
  const camel = String(rider.telegramChatId || '').trim();
  if (camel) return camel;
  return String(rider.telegram_chat_id || '').trim();
}

export function readResolvedTelegramChatId(
  rider: { telegramChatId?: unknown; telegram_chat_id?: unknown },
  fallbackChatId?: string,
): string {
  const riderChatId = readTelegramRiderChatId(rider);
  const requestChatId = String(fallbackChatId || '').trim();
  return riderChatId || requestChatId;
}

export function readOptionalTelegramCallbackData(build: () => string): string {
  try {
    return build();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'missing_telegram_callback_secret') return '';
    throw error;
  }
}

export async function sendAdminTelegramWithReplyMarkupRetry({
  request,
  payloadBase,
  replyMarkup,
  chatId,
}: {
  request: Request;
  payloadBase: Record<string, unknown>;
  replyMarkup?: unknown;
  chatId: string;
}): Promise<AdminSingleRiderTelegramResult> {
  const headers = {
    'Content-Type': 'application/json',
    ...buildForwardHeaders(request),
  };

  const sendTelegram = async (payload: Record<string, unknown>) => {
    const response = await fetch(new URL('/api/telegram/send', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    return {
      response,
      responseText,
    };
  };

  let { response, responseText } = await sendTelegram({
    ...payloadBase,
    ...(replyMarkup === undefined ? {} : { reply_markup: replyMarkup }),
  });
  const shouldRetryWithoutReplyMarkup = !response.ok
    && response.headers.get('content-type')?.includes('text/html')
    && responseText.includes('502');

  if (shouldRetryWithoutReplyMarkup) {
    ({ response, responseText } = await sendTelegram(payloadBase));
  }

  return readAdminTelegramSendOutcome({
    response,
    responseText,
    chatId,
  });
}
