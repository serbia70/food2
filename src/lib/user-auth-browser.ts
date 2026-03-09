declare global {
  interface Window {
    __userAuthBrowser?: {
      loginUser: (payload: { loginAccount: string; password: string }) => Promise<any>;
      registerUser: (payload: { accountType: 'phone' | 'email' | 'id'; account: string; password: string; name: string }) => Promise<any>;
      persistUserAuth: (result: any, fallback: {
        loginAccount?: string;
        password: string;
        account?: string;
        accountType?: 'phone' | 'email' | 'id';
        name?: string;
      }) => { user: any; sessionToken: string };
      persistGoogleUserAuth: (user: {
        id: string;
        name: string;
        email: string;
        avatar: string;
        phone?: string;
      }) => { user: any; sessionToken: string };
    };
  }
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('food_order_user') || '{}');
  } catch {
    return {};
  }
}

function saveStoredUser(nextUser: Record<string, unknown>) {
  localStorage.setItem('food_order_user', JSON.stringify(nextUser));
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

function persistUserAuth(result: any, fallback: {
  loginAccount?: string;
  password: string;
  account?: string;
  accountType?: 'phone' | 'email' | 'id';
  name?: string;
}) {
  const user = result?.user || {};
  const current = readStoredUser();
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

  saveStoredUser(nextUser);

  const sessionToken = String(result?.sessionToken || resolvedLoginAccount || resolvedPhone).trim();
  if (sessionToken) {
    localStorage.setItem('user_session', sessionToken);
  }

  return { user: nextUser, sessionToken };
}

function persistGoogleUserAuth(user: {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone?: string;
}) {
  const current = readStoredUser();
  const nextUser = {
    ...current,
    name: user.name || current.name || '',
    phone: user.phone || current.phone || '',
    email: user.email || current.email,
    avatar: user.avatar || current.avatar,
    google_id: user.id,
  };

  saveStoredUser(nextUser);

  const sessionToken = String(user.email || user.phone || user.id || '').trim();
  if (sessionToken) {
    localStorage.setItem('user_session', sessionToken);
  }

  return { user: nextUser, sessionToken };
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
