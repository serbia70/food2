import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../config';
import { proxyAdminRequest } from '../../../../../lib/admin-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/reservations/${id}/print`,
    method: 'POST',
  });
};
