import { API_PROXY_TIMEOUT_MS } from './clientConfig.ts';
import { buildProxyFailureResponse, buildProxyJsonResponse } from '../infra/http/proxy-response.ts';

function classifyProxyError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e || '');
  const errorName = e instanceof Error ? e.name : '';
  const lower = message.toLowerCase();

  if (errorName === 'AbortError') {
    return {
      status: 504,
      error: 'Backend request timeout',
      code: 'backend_timeout',
    };
  }

  if (
    lower.includes('terminated') ||
    lower.includes('other side closed') ||
    lower.includes('socket') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed')
  ) {
    return {
      status: 502,
      error: 'Backend connection closed unexpectedly',
      code: 'backend_connection_closed',
    };
  }

  return {
    status: 503,
    error: 'Backend unavailable',
    code: 'backend_unavailable',
  };
}

export async function proxyFetch(
  url: string,
  init: RequestInit,
  timeoutMs = API_PROXY_TIMEOUT_MS,
): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      const shouldRetryHtml5xx = attempt === 0
        && method === 'GET'
        && upstream.status >= 500
        && !String(upstream.headers.get('content-type') || '').includes('application/json');
      if (shouldRetryHtml5xx) continue;

      return await buildProxyJsonResponse(upstream);
    } catch (e: unknown) {
      clearTimeout(timer);
      const classified = classifyProxyError(e);
      const shouldRetry = attempt === 0 && method === 'GET' && classified.code === 'backend_connection_closed';
      if (shouldRetry) continue;
      return buildProxyFailureResponse({
        status: classified.status,
        code: classified.code,
        message: classified.error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return buildProxyFailureResponse({
    status: 503,
    code: 'backend_unavailable',
    message: 'Backend unavailable',
  });
}
