import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../../config';
import { proxyMasterRequest } from '../../../../lib/master-api-route';

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.text();
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`,
    method: 'PUT',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`,
    method: 'DELETE',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
  });
};
