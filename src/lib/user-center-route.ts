type MaybeUser = Record<string, any> | null | undefined;

export function resolveUserCenterRoute(user: MaybeUser) {
  const phone = String(user?.phone || '').trim();
  const loginAccount = String(user?.login_account || '').trim();
  return phone || loginAccount ? '/user' : '/user/login';
}
