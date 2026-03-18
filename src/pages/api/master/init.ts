import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';
import { proxyMasterRequest } from '../../../lib/master-api-route';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/init`,
    method: 'GET',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
  });
};
