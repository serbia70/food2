import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config.ts';

export const prerender = false;

function readApiBaseUrl(): string {
  return process.env.PUBLIC_API_URL || API_BASE_URL;
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const riderId = Number(body.riderId || 0);
  const riderPhone = String(body.riderPhone || '').trim();

  if (riderId <= 0 || !riderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'rider_session_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${readApiBaseUrl()}/api/rider/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: riderId, riderPhone, telegram_chat_id: '' }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'rider_unbind_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' }
  });
};
