import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not Found', { status: 404 });

  const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/menu`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
};
