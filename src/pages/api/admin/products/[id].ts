import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyAdminRequest } from '../../../../lib/admin-api-route';

export const prerender = false;

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

  return proxyAdminRequest({
    request,
    cookies,
    // Backend expects POST /api/admin/products for upsert (create/update)
    url: `${API_BASE_URL}/api/admin/products`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};

export const DELETE: APIRoute = async ({ request, params, cookies }) => {
  const id = params.id;
  if (!id) return new Response('Not Found', { status: 404 });

  const body = await request.text();

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/products/${encodeURIComponent(id)}`,
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};
