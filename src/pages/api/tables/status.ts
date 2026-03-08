import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ success: false, error: 'Not supported on Cloudflare runtime. Use backend /api endpoints.' }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
