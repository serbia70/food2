type MaybeUser = Record<string, any>;

export function buildPhoneUpdatePayload(user: MaybeUser, nextPhone: string) {
  return {
    login_account: String(user?.login_account || user?.phone || user?.email || '').trim(),
    phone: String(nextPhone || '').trim(),
  };
}

export function applyLocalNicknameUpdate<T extends MaybeUser>(user: T, nextName: string): T {
  return {
    ...user,
    name: String(nextName || '').trim(),
  };
}
