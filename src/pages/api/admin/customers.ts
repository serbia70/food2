import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyAdminRequest } from '../../../lib/admin-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const q = new URL(request.url).search || '';
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/customers${q}`,
    method: 'GET',
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/customers`,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
};
