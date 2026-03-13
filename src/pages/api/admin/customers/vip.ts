import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config';
import { proxyFetch } from '../../../../lib/api-proxy';
import { buildVipUpstreamCandidates } from '../../../../lib/vip-upstream-candidates';
import { postWithVipUpstreamCandidates } from '../../../../lib/vip-upstream-request';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const headerAuth = request.headers.get('authorization') || '';
  const cookieToken = cookies.get('admin_token')?.value || '';
  const auth = headerAuth || (cookieToken ? `Bearer ${cookieToken}` : '');

  const rawBody = await request.text();

  // If body is invalid JSON, fall back to passthrough.
  let parsed: any = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return proxyFetch(`${API_BASE_URL}/api/admin/customers/vip`, {
      method: "POST",
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        'Content-Type': 'application/json',
      },
      body: rawBody,
    });
  }

  const candidates = buildVipUpstreamCandidates(parsed);

  return postWithVipUpstreamCandidates({
    candidates,
    post: (body) =>
      proxyFetch(`${API_BASE_URL}/api/admin/customers/vip`, {
        method: 'POST',
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          'Content-Type': 'application/json',
        },
        body,
      }),
  });
};
