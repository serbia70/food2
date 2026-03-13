import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../../config';
import { resolveMasterAuth } from '../../../../lib/master-auth';

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const auth = resolveMasterAuth(request, cookies, MASTER_TOKEN, { allowFallbackToken: false });
    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.text();
    const res = await fetch(`${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
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

export const DELETE: APIRoute = async ({ request, cookies, params }) => {
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const auth = resolveMasterAuth(request, cookies, MASTER_TOKEN, { allowFallbackToken: false });
    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${API_BASE_URL}/api/master/shops/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: auth,
      },
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
