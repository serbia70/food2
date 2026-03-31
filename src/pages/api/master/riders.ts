import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyMasterRequest } from '../../../lib/master-api-route.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/riders`,
    method: 'GET',
  });
};
