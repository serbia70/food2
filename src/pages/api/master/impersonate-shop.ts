import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config';
import { resolveMasterAuth } from '../../../lib/master-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const auth = resolveMasterAuth(request, cookies, MASTER_TOKEN, { allowFallbackToken: false });
    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = await request.json().catch(() => ({}));
    const id = Number(body?.id || 0);

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'invalid shop id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${API_BASE_URL}/api/master/impersonate-shop?id=${encodeURIComponent(String(id))}`, {
      method: 'GET',
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    const secure = import.meta.env.PROD || new URL(request.url).protocol === 'https:';

    if (!res.ok || !data?.success || !data?.token || !data?.slug) {
      return new Response(JSON.stringify({ success: false, error: data?.error || 'impersonate failed' }), {
        status: res.status || 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    cookies.set('admin_token', data.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 2,
    });

    cookies.set('admin_impersonated', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 2,
    });

    cookies.set('master_impersonated', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 2,
    });

    return new Response(JSON.stringify({ success: true, slug: data.slug, impersonated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
