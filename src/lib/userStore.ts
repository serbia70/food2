import { atom, map } from "nanostores";
import { DEFAULT_USER_PASSWORD } from "./clientConfig";

const KEY_USER = "food_order_user";
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
  password: DEFAULT_USER_PASSWORD,
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
    if (storedUser) {
      const data = JSON.parse(storedUser) as Partial<UserState>;
      $userStore.set({
        ...defaultState,
        ...data,
        password: data.password || DEFAULT_USER_PASSWORD,
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
    localStorage.setItem(KEY_USER, JSON.stringify(value));
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
  password?: string,
  newAddress?: string,
  extra: Partial<UserState> = {},
) => {
  const current = $userStore.get();
  let addrs = [...(current.addresses || [])];

  if (newAddress && !addrs.includes(newAddress)) {
    addrs.unshift(newAddress);
    addrs = addrs.slice(0, 3);
  }

  $userStore.set({
    ...current,
    name: name || current.name,
    phone: phone || current.phone,
    password: password || current.password,
    addresses: addrs,
    ...extra,
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
