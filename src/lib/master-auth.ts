type CookieValue = { value: string } | undefined;

type CookieStore = {
  get: (key: string) => CookieValue;
};

type ResolveMasterAuthOptions = {
  allowFallbackToken?: boolean;
};

export function resolveMasterAuth(
  request: Request,
  cookies?: CookieStore,
  fallbackToken?: string,
  options?: ResolveMasterAuthOptions,
): string {
  const headerAuth = request.headers.get('authorization') || '';
  if (headerAuth.trim()) {
    return headerAuth;
  }

  const cookieToken = cookies?.get('master_token')?.value?.trim() || '';
  if (cookieToken) {
    return `Bearer ${cookieToken}`;
  }

  const allowFallbackToken = options?.allowFallbackToken ?? true;
  if (allowFallbackToken && fallbackToken?.trim()) {
    return `Bearer ${fallbackToken.trim()}`;
  }

  return '';
}
