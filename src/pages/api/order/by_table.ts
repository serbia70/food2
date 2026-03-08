import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const slug = String(url.searchParams.get('slug') || '').trim();
    const table = String(url.searchParams.get('table') || '').trim();
    if (!slug || !table) {
      return new Response(
        JSON.stringify({ success: false, error: 'slug and table required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const upstream = `${API_BASE_URL}/api/order/by_table?slug=${encodeURIComponent(slug)}&table=${encodeURIComponent(table)}`;
    const res = await fetch(upstream, { method: 'GET' });
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'proxy failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
