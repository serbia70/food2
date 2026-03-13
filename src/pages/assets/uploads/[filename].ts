import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { fetchUpstreamUpload } from '../../../lib/uploads-proxy';

export const prerender = false;

// Back-compat proxy:
// Some backend/menu records still reference images as `/assets/uploads/<filename>`.
// In Astro (Cloudflare) the browser hits the frontend origin, so we proxy this path
// to the backend asset origin.
export const GET: APIRoute = async ({ params }) => {
  const filename = params.filename;
  if (!filename) return new Response('Missing filename', { status: 400 });

  const res = await fetchUpstreamUpload({ apiBaseUrl: API_BASE_URL, filename });
  if (!res) return new Response('Not found', { status: 404 });

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
