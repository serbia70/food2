import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not Found', { status: 404 });

  const payload = await request.arrayBuffer();

  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/order`, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') || 'application/json' },
    body: payload,
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
