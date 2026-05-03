import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../../config';
import { proxyAdminRequest } from '../../../../../../lib/admin-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const table = params.table;
  if (!table) return new Response('Not Found', { status: 404 });

  const body = await request.text();

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/tables/${encodeURIComponent(table)}/reviews/reject`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};
