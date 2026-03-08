import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();
    const auth = request.headers.get('authorization') || `Bearer ${MASTER_TOKEN}`;
    const res = await fetch(`${API_BASE_URL}/api/master/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
