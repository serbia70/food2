import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${API_BASE_URL}/api/order/status?id=${encodeURIComponent(id)}`, {
      method: 'GET',
    });

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
