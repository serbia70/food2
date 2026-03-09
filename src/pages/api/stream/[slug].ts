import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

function buildProxyErrorResponse(status: number, error: string, code: string) {
  return new Response(
    JSON.stringify({ success: false, error, code }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function classifyProxyError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e || '');
  const errorName = e instanceof Error ? e.name : '';
  const lower = message.toLowerCase();

  if (errorName === 'AbortError') {
    return { status: 504, error: 'Stream request timeout', code: 'stream_timeout' };
  }
  if (lower.includes('terminated') || lower.includes('other side closed') || lower.includes('socket')) {
    return {
      status: 502,
      error: 'Stream connection closed unexpectedly',
      code: 'stream_connection_closed',
    };
  }
  return { status: 503, error: 'Stream unavailable', code: 'stream_unavailable' };
}

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
    const upstream = await fetch(`${API_BASE_URL}/stream/${encodeURIComponent(slug)}`, {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(text || JSON.stringify({ success: false, error: 'stream unavailable', code: 'stream_unavailable' }), {
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
    const classified = classifyProxyError(e);
    return buildProxyErrorResponse(classified.status, classified.error, classified.code);
  }
};
