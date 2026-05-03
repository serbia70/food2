import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { proxyMasterRequest } from '../../../lib/master-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.text();
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/commission-batch`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};
