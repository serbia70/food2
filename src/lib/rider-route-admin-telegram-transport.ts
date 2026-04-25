import { type DispatchMeta } from './rider-dispatch.ts';

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

export function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function readTelegramSendResult(
  response: Response,
  responseText: string,
): { ok: true; messageId: number } | { ok: false; error: string } {
  const parsedResponse = readJsonObject(responseText);
  if (!response.ok || parsedResponse?.success === false || parsedResponse?.ok === false) {
    return {
      ok: false,
      error: responseText.trim() || `telegram_send_http_${response.status}`,
    };
  }

  const rawResult = parsedResponse?.result;
  const messageId = Number(
    (rawResult && typeof rawResult === 'object'
      ? (rawResult as { message_id?: unknown }).message_id
      : undefined)
    ?? parsedResponse?.message_id
    ?? 0,
  );

  return {
    ok: true,
    messageId,
  };
}

export function readTelegramMessageRefFromResponse(
  body: Record<string, unknown>,
  fallbackChatId = '',
): { chatId: string; messageId: number } | null {
  const result = body.result && typeof body.result === 'object' ? body.result as Record<string, unknown> : null;
  const chatId = String(
    body.chatId
      || body.chat_id
      || result?.chatId
      || result?.chat_id
      || (result?.chat && typeof result.chat === 'object' ? (result.chat as Record<string, unknown>).id : '')
      || fallbackChatId
      || '',
  ).trim();
  const messageId = Number(
    body.messageId
      || body.message_id
      || result?.messageId
      || result?.message_id
      || 0,
  );
  return chatId && Number.isInteger(messageId) && messageId > 0 ? { chatId, messageId } : null;
}

export type AdminSingleRiderTelegramResult =
  | { success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> }
  | { success: false; error: string };

export function readAdminTelegramSendOutcome({
  response,
  responseText,
  chatId,
}: {
  response: Response;
  responseText: string;
  chatId: string;
}): { success: true; messageRef?: NonNullable<DispatchMeta['telegramMessageRef']> } | { success: false; error: string } {
  const sendResult = readTelegramSendResult(response, responseText);
  if (!sendResult.ok) {
    return {
      success: false,
      error: sendResult.error,
    };
  }

  return {
    success: true,
    ...(sendResult.messageId > 0 ? { messageRef: { chatId, messageId: sendResult.messageId } } : {}),
  };
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

export type AdminTelegramSendMessage = {
  text: string;
  replyMarkup?: unknown;
};

export function normalizeTelegramSendError(error: unknown): string {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return errorMessage || 'telegram_send_failed';
}
