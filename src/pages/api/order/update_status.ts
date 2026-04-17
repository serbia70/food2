import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { buildForwardHeaders } from '../../../lib/rider-route-shared.ts';

export const prerender = false;

export async function forwardOrderUpdateStatus(request: Request, routeId?: string): Promise<Response> {
  const body = await request.text();
  const payload = body ? JSON.parse(body) as Record<string, unknown> : {};
  const id = String(routeId || payload.id || '').trim();
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'order_id_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedPayload = body ? { ...payload } : {} as Record<string, unknown>;
  const numericId = Number(id);
  if (Number.isInteger(numericId) && numericId > 0) {
    normalizedPayload.id = numericId;
  }

  const res = await fetch(`${API_BASE_URL}/api/order/update_status/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(request),
    },
    body: JSON.stringify(normalizedPayload),
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => forwardOrderUpdateStatus(request);
