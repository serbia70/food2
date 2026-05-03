export type CookieValue = { value: string } | undefined;

export type CookieStore = {
  get: (key: string) => CookieValue;
};

function readTokenFromRawCookieHeader(request: Request, cookieKey: string): string {
  const rawCookie = request.headers.get('cookie') || '';
  if (!rawCookie) return '';

  for (const chunk of rawCookie.split(';')) {
    const [rawKey, ...rest] = chunk.split('=');
    if (String(rawKey || '').trim() !== cookieKey) continue;
    const value = rest.join('=').trim();
    return value || '';
  }

  return '';
}

export function resolveSessionToken(request: Request, cookies: CookieStore | undefined, cookieKey: string): string {
  const auth = request.headers.get('authorization')?.trim() || '';
  if (auth) {
    return auth;
  }

  const token = cookies?.get(cookieKey)?.value?.trim() || readTokenFromRawCookieHeader(request, cookieKey);
  return token ? `Bearer ${token}` : '';
}
