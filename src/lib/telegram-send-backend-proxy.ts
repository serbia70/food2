import { API_BASE_URL } from '../config.ts';
import { json, parseJsonResponse } from './telegram-send-transport.ts';

function readProxyAuthHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = String(request.headers.get('cookie') || '').trim();
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

function describeFetchError(error: unknown): { message: string; cause?: string; code?: string; debugShape?: string } {
  const fallback = {
    message: error instanceof Error ? error.message : 'fetch_failed',
  } as { message: string; cause?: string; code?: string; debugShape?: string };

  if (error instanceof Error) {
    const rawSummary = String(error.stack || `${error.name}: ${error.message}` || '').trim();
    if (rawSummary) fallback.cause = rawSummary.split('\n')[0]?.trim() || rawSummary;
  }

  return fallback;
}

export function buildBackendTelegramPayload(
  shopSlug: string,
  numericShopSlug: boolean,
  telegramPayload: Record<string, unknown>,
  token?: string,
): Record<string, unknown> {
  return {
    ...(!numericShopSlug && shopSlug ? { shopSlug } : {}),
    ...(token ? { telegram_bot_token: token } : {}),
    ...telegramPayload,
  };
}

export async function proxyTelegramSendToBackend(request: Request, payload: Record<string, unknown>): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/telegram/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...readProxyAuthHeaders(request),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return json({
      success: false,
      error: 'telegram_send_failed',
      backend_proxy: true,
      ...describeFetchError(error),
    }, 502);
  }

  const text = await upstream.text();
  const parsed = parseJsonResponse(text);
  return json({
    ...(parsed && Object.keys(parsed).length > 0 ? parsed : { success: upstream.ok }),
    ...(parsed.backend_proxy === undefined ? { backend_proxy: true } : {}),
  }, upstream.status);
}
