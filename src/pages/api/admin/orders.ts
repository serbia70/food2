import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyAdminRequest } from '../../../lib/admin-api-route.ts';
export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const q = url.search || '';

  const res = await proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/orders${q}`,
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  const ct = res.headers.get('content-type') || 'application/json';
  const raw = await res.text();

  return new Response(raw, {
    status: res.status,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
};
