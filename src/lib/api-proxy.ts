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

  if (lower.includes('terminated') || lower.includes('other side closed') || lower.includes('socket')) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    return await buildProxyJsonResponse(upstream);
  } catch (e: unknown) {
    const classified = classifyProxyError(e);
    return buildProxyFailureResponse({
      status: classified.status,
      code: classified.code,
      message: classified.error,
    });
  } finally {
    clearTimeout(timer);
  }
}
