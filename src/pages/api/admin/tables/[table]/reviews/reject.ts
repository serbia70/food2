import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../../../config';
import { proxyFetch } from '../../../../../../lib/api-proxy';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const table = params.table;
  if (!table) return new Response('Not Found', { status: 404 });

  const body = await request.text();
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');

  return proxyFetch(
    `${API_BASE_URL}/api/admin/tables/${encodeURIComponent(table)}/reviews/reject`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
    },
  );
};
