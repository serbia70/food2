import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyFetch } from '../../../../lib/api-proxy';

export const prerender = false;

async function getAuthHeaders(request: Request, cookies: any) {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
  return auth ? { Authorization: auth } : {};
}

export const PUT: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id) return new Response('Not Found', { status: 404 });

  const raw = await request.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  // Backend expects product id inside JSON payload for upsert.
  const body = JSON.stringify({ ...parsed, id: Number(id) });
  const authHeaders = await getAuthHeaders(request, cookies);

  return proxyFetch(`${API_BASE_URL}/api/admin/products`, {
    // Backend expects POST /api/admin/products for upsert (create/update)
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body,
  });
};

export const DELETE: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id) return new Response('Not Found', { status: 404 });

  const body = await request.text();
  const authHeaders = await getAuthHeaders(request, cookies);

  return proxyFetch(`${API_BASE_URL}/api/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body,
  });
};
