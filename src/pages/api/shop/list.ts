import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { createApiError, createApiSuccess } from '../../../domain/api/api-envelope.ts';
import { parseJsonEnvelope } from '../../../infra/http/http-json-client.ts';

export const prerender = false;

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

async function buildCanonicalErrorResponse(upstream: Response) {
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
        payload.error.message || 'Upstream request failed',
        payload.error.details,
      )),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify(createApiError('backend_unavailable', 'Backend unavailable')),
    {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export const GET: APIRoute = async () => {
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/home`);

    if (!upstream.ok) {
      return buildCanonicalErrorResponse(upstream);
    }

    const payload = await parseJsonEnvelope<unknown>(upstream);

    return new Response(JSON.stringify(createApiSuccess(payload)), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify(createApiError('backend_unavailable', 'Backend unavailable')),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
