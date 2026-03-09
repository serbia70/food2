import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyAdminRequest } from '../../../lib/admin-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/reservations${url.search || ''}`,
    method: 'GET',
  });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
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
  if (id <= 0) {
    return new Response(JSON.stringify({ success: false, error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/reservations/${id}`,
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const id = Number(body?.id || 0);
  const action = String(body?.action || '').trim();

  if (id <= 0 || !action) {
    return new Response(JSON.stringify({ success: false, error: 'id and action are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let url = `${API_BASE_URL}/api/admin/reservations/${id}/${action}`;
  let method = 'POST';

  return proxyAdminRequest({
    request,
    cookies,
    url,
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
};
