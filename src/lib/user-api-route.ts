export type UserApiKind = 'login' | 'register' | 'history';

const USER_API_CONTRACT_PATHS = {
  login: '/api/user/login',
  register: '/api/user/register',
  history: '/api/user/history',
} as const satisfies Record<UserApiKind, string>;

export function buildUserApiUrl(baseUrl: string, kind: UserApiKind, searchParams = '') {
  const normalizedBase = String(baseUrl || '').replace(/\/$/, '');
  const path = USER_API_CONTRACT_PATHS[kind];
  const query = searchParams.replace(/^\?/, '');
  return query ? `${normalizedBase}${path}?${query}` : `${normalizedBase}${path}`;
}
