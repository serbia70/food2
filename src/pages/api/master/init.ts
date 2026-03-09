import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';
import { resolveMasterAuth } from '../../../lib/master-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const auth = resolveMasterAuth(request, cookies, MASTER_TOKEN, { allowFallbackToken: false });
    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await fetch(`${API_BASE_URL}/api/master/init`, {
      method: 'GET',
      headers: { Authorization: auth },
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
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
