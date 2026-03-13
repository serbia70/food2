import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyFetch } from '../../../../lib/api-proxy';

export const prerender = false;

function authHeader(request: Request, cookies: any): string {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  return headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
}

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const auth = authHeader(request, cookies);
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  const body = await request.json().catch(() => ({}));
  
  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const auth = authHeader(request, cookies);
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  // 处理打印
  if (request.url.endsWith('/print')) {
      return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}/print`, {
        method: 'POST',
        headers: auth ? { Authorization: auth } : {},
      });
  }

  return new Response('Not Found', { status: 404 });
};
