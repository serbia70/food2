import { createApiError } from '../../domain/api/api-envelope.ts';

type ProxyFailure = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

function toJsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function buildProxyJsonResponse(upstream: Response): Promise<Response> {
  const text = await upstream.text();
  const contentType = upstream.headers.get('content-type') || '';

  if (upstream.status >= 500 && !contentType.includes('application/json')) {
    const body = createApiError('upstream_non_json', `Upstream error (${upstream.status})`, {
      upstreamStatus: upstream.status,
    });

    return toJsonResponse(upstream.status, body);
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType || 'application/json',
    },
  });
}

export function buildProxyFailureResponse(input: ProxyFailure): Response {
  const body = createApiError(input.code, input.message, input.details);
  return toJsonResponse(input.status, body);
}
