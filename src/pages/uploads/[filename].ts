import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const filename = params.filename;
  if (!filename) return new Response('Missing filename', { status: 400 });

  const upstream = `${API_BASE_URL}/assets/uploads/${encodeURIComponent(filename)}`;
  const res = await fetch(upstream);
  if (!res.ok) return new Response('Not found', { status: 404 });

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
