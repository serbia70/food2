import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';
import { buildAdminAuthHeader } from '../../lib/admin-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const payload = await request.arrayBuffer();
    const authHeaders = buildAdminAuthHeader(request, cookies);

    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: 'POST',
      headers: {
        ...(request.headers.get('content-type') ? { 'Content-Type': request.headers.get('content-type') } : {}),
        ...authHeaders,
      },
      body: payload,
    });

    const raw = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';

    if (contentType.includes('application/json')) {
      try {
        const data = raw ? JSON.parse(raw) : {};
        if (typeof data?.url === 'string' && data.url.startsWith('/assets/')) {
          data.url = new URL(data.url, API_BASE_URL).toString();
        }
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        // Fall through to raw response below.
      }
    }

    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
