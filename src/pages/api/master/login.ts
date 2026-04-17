import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { createSessionPayload } from '../../../application/auth/load-session-query.ts';
import { parseJsonEnvelope } from '../../../infra/http/http-json-client.ts';

export const prerender = false;

const isProd = Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);

type MasterLoginResult = {
  token?: string;
  userId?: number;
  displayName?: string;
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
    const body = await request.text();
    const upstream = await fetch(`${API_BASE_URL}/api/master/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!upstream.ok) {
      return buildCanonicalErrorResponse(upstream, 401, 'Invalid credentials');
    }

    let payload: MasterLoginResult;
    try {
      payload = await parseJsonEnvelope<MasterLoginResult>(upstream);
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

    cookies.set('master_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd || new URL(request.url).protocol === 'https:',
      maxAge: 60 * 60 * 12,
    });

    const session = createSessionPayload({
      kind: 'master',
      userId: payload.userId,
      displayName: payload.displayName,
    });

    return new Response(JSON.stringify(createApiSuccess(session)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify(createApiError('backend_unavailable', 'Backend unavailable')),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
