import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyAdminRequest } from '../../../lib/admin-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  return proxyAdminRequest({
    request,
    cookies,
    url: `${API_BASE_URL}/api/admin/billing`,
    method: 'GET',
  });
};
