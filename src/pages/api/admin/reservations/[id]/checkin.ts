import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../config.ts';
import { proxyFetch } from '../../../../../lib/api-proxy.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');

  const { id } = params;
  if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'id required' }), { status: 400 });
  }

  // The request body contains table info and other details
  const body = await request.text();

  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}/checkin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });
};
