import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.text();
    const res = await fetch(`${API_BASE_URL}/api/master/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}

    if (res.ok && data?.success && data?.token) {
      cookies.set('master_token', data.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: import.meta.env.PROD || new URL(request.url).protocol === 'https:',
        maxAge: 60 * 60 * 12,
      });
    }

    return new Response(text, {
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
