import type { APIRoute } from 'astro';

export const prerender = false;

type TelegramWebhookBody = {
  message?: {
    text?: unknown;
    chat?: {
      id?: unknown;
    };
  };
  callback_query?: {
    data?: unknown;
    message?: {
      chat?: {
        id?: unknown;
      };
    };
  };
};

function readTelegramRequestSecret(): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
  return String(
    env.TELEGRAM_WEBHOOK_SECRET
      || env.TELEGRAM_CALLBACK_SECRET
      || process.env.TELEGRAM_WEBHOOK_SECRET
      || process.env.TELEGRAM_CALLBACK_SECRET
      || '',
  ).trim();
}

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = readTelegramRequestSecret();
  const provided = String(request.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  return expected !== '' && provided === expected;
}

function buildJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getBindToken(text: string): string {
  const raw = String(text || '').trim();
  const prefix = '/start bind_';
  if (!raw.startsWith(prefix)) return '';
  return raw.slice('/start '.length).trim().replace(/^bind_/, '');
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return buildJsonResponse({ success: false, error: 'unauthorized_telegram_request' }, 401);
  }

  const body = await request.json().catch(() => ({})) as TelegramWebhookBody;
  const origin = new URL(request.url).origin;
  const requestSecret = readTelegramRequestSecret();

  const callbackData = String(body.callback_query?.data || '').trim();
  const callbackChatId = String(body.callback_query?.message?.chat?.id || '').trim();
  if (callbackData && callbackChatId) {
    const upstream = await fetch(`${origin}/api/telegram/rider-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': requestSecret,
      },
      body: JSON.stringify({
        callback_data: callbackData,
        chat_id: callbackChatId,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
      });
    }

    return buildJsonResponse({ success: true, route: 'rider-claim' });
  }

  const text = String(body.message?.text || '').trim();
  const chatId = String(body.message?.chat?.id || '').trim();
  const bindToken = getBindToken(text);
  if (bindToken && chatId) {
    const upstream = await fetch(`${origin}/api/telegram/rider-bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': requestSecret,
      },
      body: JSON.stringify({
        bind_token: bindToken,
        chat_id: chatId,
      }),
    });

    if (!upstream.ok) {
      const textBody = await upstream.text();
      return new Response(textBody, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
      });
    }

    return buildJsonResponse({ success: true, route: 'rider-bind' });
  }

  return buildJsonResponse({ success: true, ignored: true });
};
