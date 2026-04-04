import type { APIRoute } from 'astro';
import { readAdminAuth } from '../../../lib/admin-api-route.ts';

export const prerender = false;

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!readAdminAuth(request, cookies)) {
    return jsonResponse(401, { success: false, error: 'unauthorized' });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return jsonResponse(400, { success: false, error: 'invalid_json' });
  }

  const shopSlug = String(body.shopSlug || '').trim();
  if (!shopSlug) {
    return jsonResponse(400, { success: false, error: 'shop_slug_required' });
  }

  const riderChatId = String(body.riderChatId || '').trim();
  if (!riderChatId) {
    return jsonResponse(400, { success: false, error: 'telegram_chat_id_missing' });
  }

  const riderName = String(body.riderName || '').trim() || '骑手';
  const now = new Date().toISOString();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookie = request.headers.get('cookie') || '';
    if (cookie) headers.cookie = cookie;

    const upstreamResponse = await fetch(`${new URL(request.url).origin}/api/telegram/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        shop_slug: shopSlug,
        chat_id: riderChatId,
        text: `Admin 骑手 Telegram 测试\n店铺：${shopSlug}\n骑手：${riderName}\n时间：${now}`,
      }),
    });

    const upstreamText = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (!upstreamResponse.ok && contentType.includes('application/json')) {
      const payload = JSON.parse(upstreamText || '{}') as Record<string, unknown>;
      return jsonResponse(upstreamResponse.status, payload);
    }

    return new Response(upstreamText, {
      status: upstreamResponse.status,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
    });
  } catch {
    return jsonResponse(502, {
      success: false,
      error: 'telegram_test_failed',
    });
  }
};
