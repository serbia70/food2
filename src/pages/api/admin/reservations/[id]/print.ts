import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../config';
import { proxyFetch } from '../../../../../lib/api-proxy';

export const prerender = false;

function authHeader(request: Request, cookies: any): string {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  return headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const auth = authHeader(request, cookies);
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}/print`, {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });
};
