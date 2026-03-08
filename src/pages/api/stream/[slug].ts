import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = String(params.slug || '').trim();
  if (!slug) {
    return new Response(JSON.stringify({ success: false, error: 'slug required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/api/stream/${encodeURIComponent(slug)}`, {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(text || JSON.stringify({ success: false, error: 'stream unavailable' }), {
        status: upstream.status || 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
