import type { AstroCookies } from 'astro';
import { proxyFetch } from './api-proxy.ts';

function readTokenFromRawCookieHeader(request: Request): string {
  const rawCookie = request.headers.get('cookie') || '';
  if (!rawCookie) return '';

  for (const chunk of rawCookie.split(';')) {
    const [rawKey, ...rest] = chunk.split('=');
    if (String(rawKey || '').trim() !== 'admin_token') continue;
    const value = rest.join('=').trim();
    return value || '';
  }

  return '';
}

export function readAdminAuth(request: Request, cookies: AstroCookies): string {
  const headerAuth = request.headers.get('authorization') || '';
  if (headerAuth) return headerAuth;

  const cookieToken = cookies.get('admin_token')?.value || readTokenFromRawCookieHeader(request);
  return cookieToken ? `Bearer ${cookieToken}` : '';
}

export function buildAdminAuthHeader(request: Request, cookies: AstroCookies): Record<string, string> {
  const auth = readAdminAuth(request, cookies);
  return auth ? { Authorization: auth } : {};
}

export async function proxyAdminRequest(options: {
  request: Request;
  cookies: AstroCookies;
  url: string;
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}) {
  const { request, cookies, url, method = request.method, body, headers = {} } = options;
  const authHeaders = buildAdminAuthHeader(request, cookies);

  return proxyFetch(url, {
    method,
    headers: {
      ...authHeaders,
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}
