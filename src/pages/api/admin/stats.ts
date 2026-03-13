import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyFetch } from '../../../lib/api-proxy';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
  const q = url.search || '';
  return proxyFetch(`${API_BASE_URL}/api/admin/stats${q}`, {
    method: "GET",
    headers: auth ? { Authorization: auth } : {},
  });
};
