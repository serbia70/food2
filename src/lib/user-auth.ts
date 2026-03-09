import { saveUserInfo, setSessionToken, type UserState } from './userStore';

export type LoginPayload = {
  loginAccount: string;
  password: string;
};

export type RegisterPayload = {
  accountType: 'phone' | 'email' | 'id';
  account: string;
  password: string;
  name: string;
};

export type AuthResponse = {
  success: boolean;
  error?: string;
  sessionToken?: string;
  user?: Partial<UserState> & {
    last_address?: string;
    addresses?: string[];
  };
};

export type GoogleAuthUser = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone?: string;
};

type PersistFallback = {
  loginAccount?: string;
  password: string;
  account?: string;
  accountType?: 'phone' | 'email' | 'id';
  name?: string;
};

async function postJSON<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data as T;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  return postJSON<AuthResponse>('/api/user/login', {
    login_account: payload.loginAccount,
    password: payload.password,
  });
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  return postJSON<AuthResponse>('/api/user/register', {
    account_type: payload.accountType,
    account: payload.account,
    password: payload.password,
    name: payload.name,
  });
}

export function persistUserAuth(result: AuthResponse, fallback: PersistFallback) {
  const user = result.user || {};
  const resolvedLoginAccount = String(user.login_account || fallback.loginAccount || fallback.account || '').trim();
  const resolvedPhone = String(
    user.phone || (fallback.accountType === 'phone' ? fallback.account : '') || fallback.loginAccount || ''
  ).trim();
  const resolvedName = String(user.name || fallback.name || '').trim();
  const resolvedAddress = String(user.last_address || '').trim();

  saveUserInfo(
    resolvedName,
    resolvedPhone,
    fallback.password,
    resolvedAddress,
    {
      email: user.email,
      avatar: user.avatar,
      login_account: resolvedLoginAccount,
      addresses: Array.isArray(user.addresses) ? user.addresses : undefined,
    },
  );

  const sessionToken = String(result.sessionToken || resolvedLoginAccount || resolvedPhone).trim();
  setSessionToken(sessionToken || null);

  return {
    user: {
      ...user,
      name: resolvedName,
      phone: resolvedPhone,
      login_account: resolvedLoginAccount,
      last_address: resolvedAddress,
      addresses: Array.isArray(user.addresses) ? user.addresses : [],
    },
    sessionToken,
  };
}

export function persistGoogleUserAuth(user: GoogleAuthUser) {
  saveUserInfo(user.name, user.phone || '', undefined, '', {
    email: user.email,
    avatar: user.avatar,
    google_id: user.id,
  });

  const sessionToken = String(user.email || user.phone || user.id || '').trim();
  setSessionToken(sessionToken || null);

  return {
    user: {
      name: user.name,
      phone: user.phone || '',
      email: user.email,
      avatar: user.avatar,
      google_id: user.id,
    },
    sessionToken,
  };
}
