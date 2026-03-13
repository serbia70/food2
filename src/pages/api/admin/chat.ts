import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyAdminRequest } from '../../../lib/admin-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/chat${url.search || ''}`,
    method: 'GET',
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/chat`,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
};
