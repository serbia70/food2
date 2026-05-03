import { resolveSessionToken, type CookieStore } from '../infra/auth/session-cookie.ts';

export function resolveMasterAuth(request: Request, cookies?: CookieStore): string {
  return resolveSessionToken(request, cookies, 'master_token');
}
