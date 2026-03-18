import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';
import { proxyMasterRequest } from '../../../lib/master-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const contentType = request.headers.get('content-type') || '';
  const body = await request.arrayBuffer();

  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/upload`,
    method: 'POST',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
    headers: {
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
};
