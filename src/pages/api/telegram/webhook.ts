import type { APIRoute } from 'astro';
import { SITE_BASE_URL } from '../../../config.ts';
import { readTelegramRequestSecret } from '../../../lib/telegram-secrets.ts';
import { handleTelegramRiderClaim } from './rider-claim.ts';

export const prerender = false;

type TelegramWebhookBody = {
  message?: {
    text?: unknown;
    chat?: {
      id?: unknown;
    };
  };
  callback_query?: {
    id?: unknown;
    data?: unknown;
    message?: {
      chat?: {
        id?: unknown;
      };
    };
  };
};

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

function readTelegramSiteOrigin(request: Request): string {
  const configured = String(SITE_BASE_URL || '').trim().replace(/\/$/, '');
  return configured || new URL(request.url).origin;
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
  const origin = readTelegramSiteOrigin(request);
  const requestSecret = readTelegramRequestSecret();

  const callbackId = String(body.callback_query?.id || '').trim();
  const callbackData = String(body.callback_query?.data || '').trim();
  const callbackChatId = String(body.callback_query?.message?.chat?.id || '').trim();
  if (callbackData && callbackChatId) {
    const claimRequest = new Request(`${origin}/api/telegram/rider-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-claim-secret': requestSecret,
        'cookie': request.headers.get('cookie') || '',
        'authorization': request.headers.get('authorization') || '',
      },
      body: JSON.stringify({
        callbackData,
        chatId: callbackChatId,
      }),
    });
    const upstream = await handleTelegramRiderClaim(claimRequest);

    const upstreamText = await upstream.text();
    const upstreamJson = upstreamText ? JSON.parse(upstreamText) as Record<string, unknown> : null;
    if (!upstream.ok) {
      const errorText = String(upstreamJson?.error || '').trim();
      const text = errorText === 'expired_callback' ? '操作已过期' : '操作失败';
      return buildJsonResponse(
        callbackId
          ? { method: 'answerCallbackQuery', callback_query_id: callbackId, text }
          : { success: false, error: errorText || 'rider_claim_failed' },
      );
    }

    const action = String(upstreamJson?.action || '').trim();
    const text = action === 'decline'
      ? '已拒单'
      : action === 'picked_up'
        ? '已取餐'
        : action === 'complete'
          ? '已送达'
          : '已接单';
    return buildJsonResponse(
      callbackId
        ? { method: 'answerCallbackQuery', callback_query_id: callbackId, text }
        : { success: true, route: 'rider-claim' },
    );
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
        bindToken,
        chatId,
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
