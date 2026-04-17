import { atom, map } from "nanostores";

const KEY_USER = "food_order_user";
const KEY_LEGACY_USER = "user_info";
const KEY_SESSION = "user_session";

export interface UserState {
  name: string;
  phone: string;
  password?: string;
  addresses: string[];
  email?: string;
  avatar?: string;
  google_id?: string;
  login_account?: string;
  [key: string]: unknown;
}

// Default state
const defaultState: UserState = {
  name: "",
  phone: "",
  addresses: [],
};

// Create a map store for user info
export const $userStore = map<UserState>(defaultState);

// Create an atom for session token
export const $sessionToken = atom<string | null>(null);

// Initialize from localStorage (client-side only)
if (typeof localStorage !== "undefined") {
  try {
    const storedUser = localStorage.getItem(KEY_USER);
    const storedLegacyUser = localStorage.getItem(KEY_LEGACY_USER);

    let parsedUser: Partial<UserState> | null = null;
    if (storedUser) {
      try {
        parsedUser = JSON.parse(storedUser) as Partial<UserState>;
      } catch {
        parsedUser = null;
      }
    }

    if (!parsedUser && storedLegacyUser) {
      try {
        parsedUser = JSON.parse(storedLegacyUser) as Partial<UserState>;
      } catch {
        parsedUser = null;
      }
    }

    if (parsedUser) {
      const { password: _password, ...data } = parsedUser;
      $userStore.set({
        ...defaultState,
        ...data,
      });
    }

    const storedToken = localStorage.getItem(KEY_SESSION);
    if (storedToken) {
      $sessionToken.set(storedToken);
    }
  } catch (e) {
    console.error("Failed to load user info", e);
  }
}

// Subscribe to changes and persist to localStorage
if (typeof localStorage !== "undefined") {
  $userStore.subscribe((value) => {
    const { password: _password, ...persistedValue } = value;
    localStorage.setItem(KEY_USER, JSON.stringify(persistedValue));
  });

  $sessionToken.subscribe((value) => {
    if (value) {
      localStorage.setItem(KEY_SESSION, value);
    } else {
      localStorage.removeItem(KEY_SESSION);
    }
  });
}

// Helper functions (backward compatibility)
export const getUserInfo = (): UserState => {
  return $userStore.get();
};

export const saveUserInfo = (
  name: string,
  phone: string,
  _password?: string,
  newAddress?: string,
  extra: Partial<UserState> = {},
) => {
  const current = $userStore.get();
  let addrs = [...(current.addresses || [])];

  if (newAddress && !addrs.includes(newAddress)) {
    addrs.unshift(newAddress);
    addrs = addrs.slice(0, 3);
  }

  const { password: _extraPassword, ...safeExtra } = extra;

  $userStore.set({
    ...current,
    name: name || current.name,
    phone: phone || current.phone,
    addresses: addrs,
    ...safeExtra,
  });
};

export const clearUser = () => {
  $userStore.set(defaultState);
  $sessionToken.set(null);
  if (typeof location !== "undefined") location.reload();
};

export const getSessionToken = () => {
  return $sessionToken.get();
};

export const setSessionToken = (value: string | null) => {
  $sessionToken.set(value);
};
