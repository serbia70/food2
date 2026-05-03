import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../config.ts';
import { proxyAdminRequest } from '../../../../../lib/admin-api-route.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'id required' }), { status: 400 });
  }

  // The request body contains table info and other details
  const body = await request.text();

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/reservations/${id}/checkin`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};
