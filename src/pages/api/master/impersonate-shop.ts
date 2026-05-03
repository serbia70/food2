import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { resolveMasterAuth } from '../../../lib/master-auth.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

type LegacyMasterImpersonateResult = {
  success?: boolean;
  token?: string;
  slug?: string;
  impersonated?: boolean;
};

type CanonicalMasterImpersonateResult = {
  ok?: boolean;
  data?: {
    token?: string;
    slug?: string;
    impersonated?: boolean;
  };
};

async function handleImpersonate(request: Request, cookies: Parameters<APIRoute>[0]['cookies'], id: number): Promise<Response> {
  const auth = resolveMasterAuth(request, cookies);
  if (!auth) {
    return new Response(JSON.stringify(createApiError('unauthorized', 'Unauthorized')), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Number.isInteger(id) || id <= 0) {
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

  const payload = await upstream.json().catch(() => null) as LegacyMasterImpersonateResult | CanonicalMasterImpersonateResult | null;
  const legacyPayload = payload && typeof payload === 'object' && 'success' in payload ? payload as LegacyMasterImpersonateResult : null;
  const canonicalPayload = payload && typeof payload === 'object' && 'ok' in payload ? payload as CanonicalMasterImpersonateResult : null;
  const success = legacyPayload?.success === true || canonicalPayload?.ok === true;
  const token = String(legacyPayload?.token || canonicalPayload?.data?.token || '').trim();
  const slug = String(legacyPayload?.slug || canonicalPayload?.data?.slug || '').trim();
  const impersonated = legacyPayload?.impersonated === true || canonicalPayload?.data?.impersonated === true;

  if (!success || !token || !slug || !impersonated) {
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
}

export const GET: APIRoute = async () => new Response(
  JSON.stringify(createApiError('method_not_allowed', 'Method not allowed')),
  {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      Allow: 'POST',
    },
  },
);

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body && typeof body === 'object' ? (body as { id?: unknown }).id || 0 : 0);
    return await handleImpersonate(request, cookies, id);
  } catch {
    return new Response(JSON.stringify(createApiError('backend_unavailable', 'Backend unavailable')), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
