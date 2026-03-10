import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { buildUserApiUrl } from '../../../lib/user-api-route';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const res = await fetch(buildUserApiUrl(API_BASE_URL, 'register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
