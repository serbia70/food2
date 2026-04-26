import assert from 'node:assert/strict';
import test from 'node:test';

import {
  persistGoogleUserAuthWithStorage,
  persistUserAuthWithStorage,
} from '../../../src/lib/user-auth-browser.ts';

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const values = new Map<string, string>(Object.entries(seed));

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function readStoredUser(storage: MemoryStorage) {
  return JSON.parse(storage.getItem('food_order_user') || '{}') as Record<string, unknown>;
}

test('persistUserAuthWithStorage strips password and clears session when backend omits sessionToken', () => {
  const storage = createMemoryStorage({
    food_order_user: JSON.stringify({ name: 'Old', phone: '111', password: 'legacy-secret' }),
    user_session: 'legacy-session',
  });

  const auth = persistUserAuthWithStorage(
    storage,
    {
      success: true,
      user: {
        name: 'Alice',
        phone: '222',
        login_account: 'alice-id',
      },
    },
    {
      loginAccount: 'alice-id',
      password: 'new-secret',
    },
  );

  assert.equal(auth.sessionToken, null);
  assert.equal(storage.getItem('user_session'), null);
  assert.deepEqual(readStoredUser(storage), {
    name: 'Alice',
    phone: '222',
    login_account: 'alice-id',
    addresses: [],
  });
});

test('persistUserAuthWithStorage keeps real backend sessionToken', () => {
  const storage = createMemoryStorage();

  const auth = persistUserAuthWithStorage(
    storage,
    {
      success: true,
      sessionToken: 'server-session',
      user: {
        name: 'Alice',
        phone: '222',
        login_account: 'alice-id',
      },
    },
    {
      loginAccount: 'alice-id',
      password: 'new-secret',
    },
  );

  assert.equal(auth.sessionToken, 'server-session');
  assert.equal(storage.getItem('user_session'), 'server-session');
  assert.equal(readStoredUser(storage).password, undefined);
});

test('persistGoogleUserAuthWithStorage clears fake session fallback without backend sessionToken', () => {
  const storage = createMemoryStorage({ user_session: 'legacy-session' });

  const auth = persistGoogleUserAuthWithStorage(storage, {
    id: 'google-id',
    name: 'Google User',
    email: 'user@example.com',
    avatar: 'avatar.png',
  });

  assert.equal(auth.sessionToken, null);
  assert.equal(storage.getItem('user_session'), null);
  assert.deepEqual(readStoredUser(storage), {
    name: 'Google User',
    phone: '',
    email: 'user@example.com',
    avatar: 'avatar.png',
    google_id: 'google-id',
  });
});

