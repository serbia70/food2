import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyMasterRequest } from '../../../lib/master-api-route.ts';
import { resolveMasterAuth } from '../../../lib/master-auth.ts';

export const prerender = false;

type MasterInitResponse = {
  ok?: boolean;
  success?: boolean;
  data?: {
    settings?: Record<string, unknown> | null;
  } | null;
  settings?: Record<string, unknown> | null;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function describeFetchError(error: unknown): { code?: string; cause?: string } {
  if (!error || typeof error !== 'object') return {};
  const record = error as Record<string, unknown>;
  const directCode = typeof record.code === 'string' ? record.code.trim() : '';
  const directCause = typeof record.cause === 'string' ? record.cause.trim() : '';
  const causeRecord = record.cause && typeof record.cause === 'object' ? record.cause as Record<string, unknown> : null;
  const nestedCode = typeof causeRecord?.code === 'string' ? causeRecord.code.trim() : '';
  const nestedCause = typeof causeRecord?.message === 'string' ? causeRecord.message.trim() : '';
  return {
    ...(nestedCode || directCode ? { code: nestedCode || directCode } : {}),
    ...(nestedCause || directCause ? { cause: nestedCause || directCause } : {}),
  };
}

function readTelegramBotTokenFromSettings(settings: Record<string, unknown> | null | undefined): string {
  if (!settings || typeof settings !== 'object') return '';
  return String(settings.telegramBotToken || settings.telegram_bot_token || '').trim();
}

async function readSavedTelegramBotToken(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const response = await proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/init`,
    method: 'GET',
  });
  const text = await response.text();

  if (!response.ok) {
    return {
      errorResponse: new Response(text, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
      }),
      token: '',
    };
  }

  try {
    const parsed = JSON.parse(text) as MasterInitResponse;
    return {
      token:
        readTelegramBotTokenFromSettings(parsed.data?.settings)
        || readTelegramBotTokenFromSettings(parsed.settings),
    };
  } catch {
    return {
      errorResponse: json({ success: false, error: 'master_settings_unavailable' }, 502),
      token: '',
    };
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!resolveMasterAuth(request, cookies as never)) {
    return json({
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
      },
    }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return json({ success: false, error: 'invalid_json' }, 400);
  }

  const inlineToken = String(payload.telegramBotToken || payload.telegram_bot_token || '').trim();
  let tokenSource: 'inline' | 'saved' = inlineToken ? 'inline' : 'saved';
  let token = inlineToken;

  if (!token) {
    const saved = await readSavedTelegramBotToken(request, cookies);
    if (saved.errorResponse) return saved.errorResponse;
    token = saved.token;
  }

  if (!token) {
    return json({ success: false, error: 'telegram_bot_token_not_configured' }, 400);
  }

  let telegramResponse: Response;
  try {
    telegramResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  } catch (error) {
    return json({
      success: false,
      error: 'telegram_webhook_info_fetch_failed',
      details: describeFetchError(error),
    }, 502);
  }
  const text = await telegramResponse.text();

  if (!telegramResponse.ok) {
    return new Response(text, {
      status: telegramResponse.status,
      headers: { 'Content-Type': telegramResponse.headers.get('content-type') || 'application/json' },
    });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ success: false, error: 'telegram_webhook_info_invalid_json' }, 502);
  }

  return json({
    success: true,
    tokenSource,
    webhook: parsed.result && typeof parsed.result === 'object' ? parsed.result : {},
  }, 200);
};
