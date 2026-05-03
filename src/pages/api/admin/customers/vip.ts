import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyAdminRequest } from '../../../../lib/admin-api-route';
import { buildVipUpstreamCandidates } from '../../../../lib/vip-upstream-candidates';
import { postWithVipUpstreamCandidates } from '../../../../lib/vip-upstream-request';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const rawBody = await request.text();

  // If body is invalid JSON, fall back to passthrough.
  let parsed: any = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return proxyAdminRequest({
      request,
      cookies,
      url: `${API_BASE_URL}/api/admin/customers/vip`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: rawBody,
    });
  }

  const candidates = buildVipUpstreamCandidates(parsed);

  return postWithVipUpstreamCandidates({
    candidates,
    post: (body) =>
      proxyAdminRequest({
        request,
        cookies,
        url: `${API_BASE_URL}/api/admin/customers/vip`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      }),
  });
};
