import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { createSessionPayload } from '../../../application/auth/load-session-query.ts';
import { parseJsonEnvelope } from '../../../infra/http/http-json-client.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

type AdminLoginResult = {
  token?: string;
};

function isCanonicalErrorEnvelope(value: unknown): value is {
  ok: false;
  error: { code?: string; message?: string; details?: unknown };
} {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value as { ok?: unknown }).ok === false
    && 'error' in value;
}

async function buildCanonicalErrorResponse(upstream: Response, fallbackStatus: number, fallbackMessage: string) {
  let payload: unknown;

  try {
    payload = await upstream.json();
  } catch {
    payload = null;
  }

  if (isCanonicalErrorEnvelope(payload)) {
    return new Response(
      JSON.stringify(createApiError(
        payload.error.code || 'upstream_error',
        payload.error.message || fallbackMessage,
        payload.error.details,
      )),
      {
        status: upstream.status || fallbackStatus,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify(createApiError('unauthorized', fallbackMessage)),
    {
      status: fallbackStatus,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const shopId = String(body?.shopId || '').trim();
    const password = String(body?.password || '');

    if (!shopId || !password) {
      return new Response(
        JSON.stringify(createApiError('invalid_request', 'Missing shopId or password')),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let upstream: Response;
    try {
      upstream = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: shopId, password }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      return new Response(
        JSON.stringify(createApiError('backend_unavailable', isAbort ? 'Backend request timeout' : 'Backend unavailable')),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return buildCanonicalErrorResponse(upstream, 401, 'Invalid credentials');
    }

    let payload: AdminLoginResult;
    try {
      payload = await parseJsonEnvelope<AdminLoginResult>(upstream);
    } catch {
      return new Response(
        JSON.stringify(createApiError('unauthorized', 'Invalid credentials')),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const token = payload.token;

    if (!token) {
      return new Response(
        JSON.stringify(createApiError('unauthorized', 'Invalid credentials')),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    cookies.set('admin_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd || new URL(request.url).protocol === 'https:',
      maxAge: 60 * 60 * 24 * 7,
    });

    return new Response(
      JSON.stringify(createApiSuccess(createSessionPayload({ kind: 'admin' }))),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch {
    return new Response(
      JSON.stringify(createApiError('invalid_request', 'Bad request')),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
