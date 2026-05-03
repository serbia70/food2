import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config.ts';
import { createApiError } from '../../../../domain/api/api-envelope.ts';
import { proxyMasterRequest } from '../../../../lib/master-api-route.ts';

export const prerender = false;

function buildInvalidShopIdResponse() {
  return new Response(JSON.stringify(createApiError('invalid_shop_id', 'Invalid shop id')), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return buildInvalidShopIdResponse();
  }

  const body = await request.text();
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) {
    return buildInvalidShopIdResponse();
  }

  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
};
