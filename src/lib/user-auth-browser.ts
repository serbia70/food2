export type BrowserAuthResult = {
  success?: boolean;
  sessionToken?: string;
  user?: Record<string, any>;
};

export type BrowserPersistFallback = {
  loginAccount?: string;
  password: string;
  account?: string;
  accountType?: 'phone' | 'email' | 'id';
  name?: string;
};

export type BrowserGoogleUser = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone?: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

declare global {
  interface Window {
    __userAuthBrowser?: {
      loginUser: (payload: { loginAccount: string; password: string }) => Promise<any>;
      registerUser: (payload: { accountType: 'phone' | 'email' | 'id'; account: string; password: string; name: string }) => Promise<any>;
      persistUserAuth: (result: BrowserAuthResult, fallback: BrowserPersistFallback) => { user: any; sessionToken: string };
      persistGoogleUserAuth: (user: BrowserGoogleUser) => { user: any; sessionToken: string };
    };
  }
}

function readStoredUser(storage: StorageLike) {
  try {
    const raw = storage.getItem('food_order_user') || storage.getItem('user_info') || '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveStoredUser(storage: StorageLike, nextUser: Record<string, unknown>) {
  const serialized = JSON.stringify(nextUser);
  storage.setItem('food_order_user', serialized);
  storage.setItem('user_info', serialized);
}

async function postJSON(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function loginUser(payload: { loginAccount: string; password: string }) {
  return postJSON('/api/user/login', {
    login_account: payload.loginAccount,
    password: payload.password,
  });
}

async function registerUser(payload: { accountType: 'phone' | 'email' | 'id'; account: string; password: string; name: string }) {
  return postJSON('/api/user/register', {
    account_type: payload.accountType,
    account: payload.account,
    password: payload.password,
    name: payload.name,
  });
}

export function persistUserAuthWithStorage(
  storage: StorageLike,
  result: BrowserAuthResult,
  fallback: BrowserPersistFallback,
) {
  const user = result?.user || {};
  const current = readStoredUser(storage);
  const resolvedLoginAccount = String(user.login_account || fallback.loginAccount || fallback.account || '').trim();
  const resolvedPhone = String(user.phone || (fallback.accountType === 'phone' ? fallback.account : '') || fallback.loginAccount || '').trim();
  const resolvedName = String(user.name || fallback.name || current.name || '').trim();

  const nextUser = {
    ...current,
    ...user,
    name: resolvedName,
    phone: resolvedPhone,
    password: fallback.password || current.password || '',
    login_account: resolvedLoginAccount,
    addresses: Array.isArray(user.addresses) ? user.addresses : current.addresses || [],
    email: user.email || current.email,
    avatar: user.avatar || current.avatar,
  };

  saveStoredUser(storage, nextUser);

  const sessionToken = String(result?.sessionToken || resolvedLoginAccount || resolvedPhone).trim();
  if (sessionToken) {
    storage.setItem('user_session', sessionToken);
  }

  return { user: nextUser, sessionToken };
}

export function persistGoogleUserAuthWithStorage(storage: StorageLike, user: BrowserGoogleUser) {
  const current = readStoredUser(storage);
  const nextUser = {
    ...current,
    name: user.name || current.name || '',
    phone: user.phone || current.phone || '',
    email: user.email || current.email,
    avatar: user.avatar || current.avatar,
    google_id: user.id,
  };

  saveStoredUser(storage, nextUser);

  const sessionToken = String(user.email || user.phone || user.id || '').trim();
  if (sessionToken) {
    storage.setItem('user_session', sessionToken);
  }

  return { user: nextUser, sessionToken };
}

export function persistUserAuth(result: BrowserAuthResult, fallback: BrowserPersistFallback) {
  return persistUserAuthWithStorage(localStorage, result, fallback);
}

export function persistGoogleUserAuth(user: BrowserGoogleUser) {
  return persistGoogleUserAuthWithStorage(localStorage, user);
}

if (typeof window !== 'undefined') {
  window.__userAuthBrowser = {
    loginUser,
    registerUser,
    persistUserAuth,
    persistGoogleUserAuth,
  };
}

export {};
