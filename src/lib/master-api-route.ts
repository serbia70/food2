import type { AstroCookies } from 'astro';
import { buildProxyFailureResponse } from '../infra/http/proxy-response.ts';
import { proxyFetch } from './api-proxy.ts';
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

    return proxyFetch(upstreamUrl, {
      method,
      headers,
      ...(options.body !== undefined ? { body: options.body } : {}),
    });
  } catch {
    return buildProxyFailureResponse({
      status: 500,
      code: 'proxy_failed',
      message: 'Proxy failed',
    });
  }
}
