export type CookieValue = { value: string } | undefined;

export type CookieStore = {
  get: (key: string) => CookieValue;
};

export function resolveSessionToken(request: Request, cookies: CookieStore | undefined, cookieKey: string): string {
  const auth = request.headers.get('authorization')?.trim() || '';
  if (auth) {
    return auth;
  }

  const token = cookies?.get(cookieKey)?.value?.trim() || '';
  return token ? `Bearer ${token}` : '';
}
