import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { parseJsonEnvelope } from '../../../infra/http/http-json-client.ts';
import { resolveMasterAuth } from '../../../lib/master-auth.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

type MasterImpersonateResult = {
  token?: string;
  slug?: string;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const auth = resolveMasterAuth(request, cookies);
    if (!auth) {
      return new Response(JSON.stringify(createApiError('unauthorized', 'Unauthorized')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json().catch(() => ({}));
    const id = Number(body && typeof body === 'object' ? (body as { id?: unknown }).id || 0 : 0);
    if (!id) {
      return new Response(JSON.stringify(createApiError('invalid_shop_id', 'Invalid shop id')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upstream = await fetch(`${API_BASE_URL}/api/master/impersonate-shop?id=${encodeURIComponent(String(id))}`, {
      method: 'GET',
      headers: { Authorization: auth },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify(createApiError('impersonate_failed', 'Impersonate failed')), {
        status: upstream.status || 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let payload: MasterImpersonateResult;
    try {
      payload = await parseJsonEnvelope<MasterImpersonateResult>(upstream);
    } catch {
      return new Response(JSON.stringify(createApiError('impersonate_failed', 'Impersonate failed')), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = String(payload.token || '').trim();
    const slug = String(payload.slug || '').trim();
    if (!token || !slug) {
      return new Response(JSON.stringify(createApiError('impersonate_failed', 'Impersonate failed')), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const secure = isProd || new URL(request.url).protocol === 'https:';
    cookies.set('admin_token', token, {
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

    return new Response(JSON.stringify(createApiSuccess({ slug, impersonated: true })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify(createApiError('proxy_failed', 'Proxy failed')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
