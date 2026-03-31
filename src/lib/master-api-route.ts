import type { AstroCookies } from 'astro';
import { createApiError } from '../domain/api/api-envelope.ts';
import { buildProxyFailureResponse, buildProxyJsonResponse } from '../infra/http/proxy-response.ts';
import { resolveMasterAuth } from './master-auth.ts';

export async function proxyMasterRequest(options: {
  request: Request;
  cookies: AstroCookies;
  upstreamUrl: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  try {
    const auth = resolveMasterAuth(options.request, options.cookies as any);

    if (!auth) {
      return buildProxyFailureResponse({
        status: 401,
        code: 'unauthorized',
        message: 'Unauthorized',
      });
    }

    const { request, upstreamUrl } = options;
    const method = options.method || request.method;
    const headers = {
      ...(options.headers || {}),
      Authorization: auth,
    };

    const init: RequestInit = {
      method,
      headers,
      ...(options.body !== undefined ? { body: options.body } : {}),
    };

    const res = await fetch(upstreamUrl, init);
    return buildProxyJsonResponse(res);
  } catch {
    return buildProxyFailureResponse({
      status: 500,
      code: 'proxy_failed',
      message: 'Proxy failed',
    });
  }
}
