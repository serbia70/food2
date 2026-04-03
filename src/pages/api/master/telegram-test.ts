import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyMasterRequest } from '../../../lib/master-api-route.ts';
import { resolveMasterAuth } from '../../../lib/master-auth.ts';

export const prerender = false;

type MasterSettingsResponse = {
  success?: boolean;
  settings?: {
    telegramBotToken?: string | null;
    telegramChatId?: string | null;
    telegram_bot_token?: string | null;
    telegram_chat_id?: string | null;
  };
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readSavedTelegramSettings(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const response = await proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/settings`,
    method: 'GET',
  });
  const text = await response.text();

  if (!response.ok) {
    return {
      errorResponse: new Response(text, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
      }),
      telegramBotToken: '',
      telegramChatId: '',
    };
  }

  try {
    const parsed = JSON.parse(text) as MasterSettingsResponse;
    return {
      telegramBotToken: String(parsed.settings?.telegramBotToken || parsed.settings?.telegram_bot_token || '').trim(),
      telegramChatId: String(parsed.settings?.telegramChatId || parsed.settings?.telegram_chat_id || '').trim(),
    };
  } catch {
    return {
      errorResponse: json({ success: false, error: 'master_settings_unavailable' }, 502),
      telegramBotToken: '',
      telegramChatId: '',
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

  const inlineTelegramBotToken = String(payload.telegramBotToken || payload.telegram_bot_token || '').trim();
  const inlineTelegramChatId = String(payload.telegramChatId || payload.telegram_chat_id || '').trim();
  let saved = { telegramBotToken: '', telegramChatId: '' } as Awaited<ReturnType<typeof readSavedTelegramSettings>>;

  if (!inlineTelegramBotToken || !inlineTelegramChatId) {
    saved = await readSavedTelegramSettings(request, cookies);
    if (saved.errorResponse) return saved.errorResponse;
  }

  const telegramBotToken = inlineTelegramBotToken || saved.telegramBotToken;
  const telegramChatId = inlineTelegramChatId || saved.telegramChatId;
  const text = String(payload.text || 'Master Telegram 测试消息').trim() || 'Master Telegram 测试消息';

  if (!telegramBotToken) {
    return json({ success: false, error: 'telegram_bot_token_not_configured' }, 400);
  }

  if (!telegramChatId) {
    return json({ success: false, error: 'telegram_chat_id_required' }, 400);
  }

  const upstreamResponse = await proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/telegram-test`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegramBotToken,
      telegramChatId,
      text,
    }),
  });

  const upstreamText = await upstreamResponse.text();
  return new Response(upstreamText, {
    status: upstreamResponse.status,
    headers: { 'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json' },
  });
};
