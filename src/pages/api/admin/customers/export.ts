import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { buildAdminAuthHeader } from '../../../../lib/admin-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const authHeaders = buildAdminAuthHeader(request, cookies);

  const upstream = `${API_BASE_URL}/api/admin/customers/export`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(upstream, {
      method: 'GET',
      headers: authHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const headers = new Headers();
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() !== 'transfer-encoding') {
        headers.set(k, v);
      }
    });

    return new Response(res.body, {
      status: res.status,
      headers,
    });
  } catch (e) {
    clearTimeout(timeout);
    return new Response('Backend unavailable', { status: 502 });
  }
};
