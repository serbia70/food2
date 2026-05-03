import { type DispatchMeta } from './rider-dispatch.ts';

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

export function normalizeTelegramSendError(error: unknown): string {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  return errorMessage || 'telegram_send_failed';
}
