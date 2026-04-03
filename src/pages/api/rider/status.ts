import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
import { buildContactableRiderRows } from '../../../lib/rider-dispatch.ts';
import type { Rider } from '../../../types/index.ts';

const apiBaseUrl = process.env.PUBLIC_API_URL || API_BASE_URL;

export const prerender = false;

function toCanonicalRiderRow(row: unknown): Rider {
  const rider = row && typeof row === 'object' ? row as Rider & { telegram_chat_id?: string | null } : {} as Rider & { telegram_chat_id?: string | null };
  return {
    ...rider,
    telegramChatId: String(rider.telegramChatId || rider.telegram_chat_id || '').trim(),
  };
}

function normalizeRiderRows(payload: unknown): Rider[] {
  const normalizeList = (rows: unknown) => Array.isArray(rows) ? rows.map((row) => toCanonicalRiderRow(row)) : [];
  if (Array.isArray(payload)) return normalizeList(payload);
  if (!payload || typeof payload !== 'object') return [];

  const data = payload as {
    riders?: unknown;
    data?: unknown;
    rows?: unknown;
    items?: unknown;
  };

  if (Array.isArray(data.riders)) return normalizeList(data.riders);
  if (Array.isArray(data.rows)) return normalizeList(data.rows);
  if (Array.isArray(data.items)) return normalizeList(data.items);

  if (data.data && typeof data.data === 'object') {
    const nested = data.data as { riders?: unknown; rows?: unknown; items?: unknown };
    if (Array.isArray(nested.riders)) return normalizeList(nested.riders);
    if (Array.isArray(nested.rows)) return normalizeList(nested.rows);
    if (Array.isArray(nested.items)) return normalizeList(nested.items);
  }

  return [];
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const action = String(url.searchParams.get('action') || '').trim();

  if (action === 'list_available') {
    const upstream = await proxyAdminRequest({
      request,
      cookies,
      url: `${apiBaseUrl}/api/admin/riders`,
      method: 'GET',
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    if (!contentType.includes('application/json')) {
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': contentType },
      });
    }

    let parsed: Record<string, unknown> | unknown = {};
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': contentType },
      });
    }

    if (!upstream.ok) {
      return new Response(JSON.stringify(parsed), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const riders = buildContactableRiderRows(normalizeRiderRows(parsed));
    return new Response(JSON.stringify({ success: true, riders }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: false, error: 'unsupported_action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const upstreamBody = parsed && 'telegramChatId' in parsed
    ? JSON.stringify(parsed)
    : body;

  const res = await fetch(`${apiBaseUrl}/api/rider/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: upstreamBody,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
