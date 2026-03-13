import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyFetch } from '../../../../lib/api-proxy';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
  const body = await request.text();
  return proxyFetch(`${API_BASE_URL}/api/admin/customers/vip`, {
    method: "POST",
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      'Content-Type': 'application/json',
    },
    body,
  });
};
