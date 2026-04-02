import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';
import { proxyFetch } from '../../lib/api-proxy.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not Found', { status: 404 });

  const res = await proxyFetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/menu`, { method: 'GET' });
  const contentType = res.headers.get('content-type') || 'application/json';

  if (!res.ok && !contentType.toLowerCase().includes('application/json')) {
    return Response.json({
      ok: false,
      error: 'Menu backend unavailable',
      code: 'menu_backend_unavailable',
      items: [],
    }, { status: res.status || 502 });
  }

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': contentType },
  });
};
