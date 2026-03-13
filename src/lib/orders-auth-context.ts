export type OrdersAuthContext =
  | { mode: 'auth'; primaryPhone: '' }
  | { mode: 'ready'; primaryPhone: string };

function phoneLike(value: unknown): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\+?\d{7,15}$/.test(v)) return v;
  if (/^0\d{7,15}$/.test(v)) return v;
  return '';
}

export function resolveOrdersAuthContext(user: { phone?: unknown; login_account?: unknown } | null | undefined): OrdersAuthContext {
  const phone = phoneLike(user?.phone);
  if (phone) return { mode: 'ready', primaryPhone: phone };

  const loginAccount = phoneLike(user?.login_account);
  if (loginAccount) return { mode: 'ready', primaryPhone: loginAccount };

  return { mode: 'auth', primaryPhone: '' };
}
