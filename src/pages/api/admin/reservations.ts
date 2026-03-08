import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyFetch } from '../../../lib/api-proxy';

export const prerender = false;

function authHeader(request: Request, cookies: any): string {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  return headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');
}

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const auth = authHeader(request, cookies);
  const q = url.search || '';
  return proxyFetch(`${API_BASE_URL}/api/admin/reservations${q}`, {
    method: 'GET',
    headers: auth ? { Authorization: auth } : {},
  });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const auth = authHeader(request, cookies);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid json body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = Number(body?.id || 0);
  const status = String(body?.status || '').trim();
  if (id <= 0 || !status) {
    return new Response(JSON.stringify({ success: false, error: 'id and status are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ status }),
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = authHeader(request, cookies);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid json body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = Number(body?.id || 0);
  const action = String(body?.action || '').trim();
  if (id <= 0 || action !== 'print') {
    return new Response(JSON.stringify({ success: false, error: 'id and action=print are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyFetch(`${API_BASE_URL}/api/admin/reservations/${id}/print`, {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });
};
