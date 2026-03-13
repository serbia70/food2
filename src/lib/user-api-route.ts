export type UserApiKind = 'login' | 'register' | 'history';

export function buildUserApiUrl(baseUrl: string, kind: UserApiKind, searchParams = '') {
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '');
  const path = kind === 'login' ? '/api/user/history' : `/api/user/${kind}`;
  return searchParams ? `${normalizedBase}${path}?${searchParams}` : `${normalizedBase}${path}`;
}
