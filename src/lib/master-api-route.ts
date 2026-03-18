import type { AstroCookies } from 'astro';
import { resolveMasterAuth } from './master-auth.ts';

export async function proxyMasterRequest(options: {
  request: Request;
  cookies: AstroCookies;
  upstreamUrl: string;
  fallbackToken?: string;
  allowFallbackToken: boolean;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response> {
  try {
    const auth = resolveMasterAuth(options.request, options.cookies as any, options.fallbackToken, {
      allowFallbackToken: options.allowFallbackToken === true,
    });

    if (!auth) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
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
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'proxy failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
