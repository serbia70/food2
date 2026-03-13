import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const shopId = String(body?.shopId || '').trim();
    const password = String(body?.password || '');
    if (!shopId || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Missing shopId or password' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: shopId, password }),
        signal: controller.signal,
      });
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Backend request timeout' : 'Backend unavailable';
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
      return new Response(JSON.stringify({ success: false, error: data?.error || 'Invalid credentials' }), {
        status: res.status || 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    cookies.set('admin_token', data.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD || new URL(request.url).protocol === 'https:',
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Bad request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
