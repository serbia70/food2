function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

const TELEGRAM_SEND_MAX_ATTEMPTS = 2;
const TELEGRAM_SEND_RETRY_DELAY_MS = 250;
const TELEGRAM_SEND_REQUEST_TIMEOUT_MS = 8000;

function describeFetchError(error: unknown): { message: string; cause?: string; code?: string; debugShape?: string } {
  if (error === 'telegram_request_timeout') {
    return {
      message: 'fetch aborted',
      cause: `Telegram request timed out after ${TELEGRAM_SEND_REQUEST_TIMEOUT_MS}ms`,
      code: 'TELEGRAM_REQUEST_TIMEOUT',
    };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'fetch aborted',
      cause: `Telegram request timed out after ${TELEGRAM_SEND_REQUEST_TIMEOUT_MS}ms`,
      code: 'TELEGRAM_REQUEST_TIMEOUT',
    };
  }

  const fallback = {
    message: error instanceof Error ? error.message : 'fetch_failed',
  } as { message: string; cause?: string; code?: string; debugShape?: string };

  if (error instanceof Error) {
    const rawSummary = String(error.stack || `${error.name}: ${error.message}` || '').trim();
    if (rawSummary) fallback.cause = rawSummary.split('\n')[0]?.trim() || rawSummary;
  }

  if (!error || typeof error !== 'object') {
    fallback.debugShape = JSON.stringify({
      primitiveType: typeof error,
      primitiveValue: String(error),
    });
    return fallback;
  }

  const errorRecord = error as Record<string, unknown>;
  const ownKeys = Object.getOwnPropertyNames(errorRecord).slice(0, 12);
  const summary = {
    ctor: errorRecord.constructor && typeof errorRecord.constructor === 'function'
      ? String((errorRecord.constructor as { name?: unknown }).name || '')
      : '',
    ownKeys,
    name: typeof errorRecord.name === 'string' ? errorRecord.name : undefined,
    message: typeof errorRecord.message === 'string' ? errorRecord.message : undefined,
    code: typeof errorRecord.code === 'string' ? errorRecord.code : undefined,
    errno: typeof errorRecord.errno === 'string' || typeof errorRecord.errno === 'number' ? String(errorRecord.errno) : undefined,
    type: typeof errorRecord.type === 'string' ? errorRecord.type : undefined,
    causeType: errorRecord.cause == null ? String(errorRecord.cause) : typeof errorRecord.cause,
  };
  const directCause = typeof errorRecord.cause === 'string' ? errorRecord.cause.trim() : '';
  const directCode = typeof errorRecord.code === 'string' ? errorRecord.code.trim() : '';
  if (directCause) fallback.cause = directCause;
  if (directCode) fallback.code = directCode;

  const cause = errorRecord.cause;
  if (!cause || typeof cause !== 'object') {
    if (!directCause && !directCode) fallback.debugShape = JSON.stringify(summary);
    return fallback;
  }

  const causeRecord = cause as Record<string, unknown>;
  const causeMessage = typeof causeRecord.message === 'string' ? causeRecord.message.trim() : '';
  const code = typeof causeRecord.code === 'string' ? causeRecord.code.trim() : '';

  if (causeMessage) fallback.cause = causeMessage;
  if (code) fallback.code = code;
  if (!directCause && !directCode && !causeMessage && !code) fallback.debugShape = JSON.stringify(summary);
  return fallback;
}

function shouldRetryTelegramSend(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const details = describeFetchError(error);
  return details.code === 'UND_ERR_CONNECT_TIMEOUT' || details.code === 'ECONNRESET' || details.code === 'ETIMEDOUT';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTelegramMessage(
  token: string,
  telegramPayload: Record<string, unknown>,
  mode: 'send' | 'edit',
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('telegram_request_timeout'), TELEGRAM_SEND_REQUEST_TIMEOUT_MS);
  const methodName = mode === 'edit' ? 'editMessageText' : 'sendMessage';
  try {
    return await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramPayload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendTelegramMessage(
  token: string,
  telegramPayload: Record<string, unknown>,
  mode: 'send' | 'edit',
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TELEGRAM_SEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await postTelegramMessage(token, telegramPayload, mode);
    } catch (error) {
      lastError = error;
      if (!shouldRetryTelegramSend(error) || attempt === TELEGRAM_SEND_MAX_ATTEMPTS) {
        throw error;
      }
      await wait(TELEGRAM_SEND_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('telegram_send_failed');
}
