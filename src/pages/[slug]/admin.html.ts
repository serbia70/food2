import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const slug = String(params.slug || '').trim();
  if (!slug) {
    return new Response('Not Found', { status: 404 });
  }
  const q = url.search || '';
  return Response.redirect(`/admin/${encodeURIComponent(slug)}${q}`, 302);
};
