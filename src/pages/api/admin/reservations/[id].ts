import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyAdminRequest } from '../../../../lib/admin-api-route';

export const prerender = false;

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  const body = await request.json().catch(() => ({}));

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/reservations/${id}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const { id } = params;
  if (!id) return new Response('ID Required', { status: 400 });

  // 处理打印
  if (request.url.endsWith('/print')) {
    return proxyAdminRequest({
      request,
      cookies,
      url: `${API_BASE_URL}/api/admin/reservations/${id}/print`,
      method: 'POST',
    });
  }

  return new Response('Not Found', { status: 404 });
};
