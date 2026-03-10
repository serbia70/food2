import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

test('persistUserAuth 同时写入新旧用户存储键', async () => {
  const storage = new MemoryStorage();
  const mod = await import('./user-auth-browser.ts');

  const result = mod.persistUserAuthWithStorage(
    storage,
    {
      success: true,
      sessionToken: 'session-001',
      user: {
        name: '测试用户',
        phone: '0600123456',
        login_account: '0600123456',
        email: 'demo@example.com',
        addresses: ['Addr 1'],
      },
    },
    {
      accountType: 'phone',
      account: '0600123456',
      password: 'secret',
      name: '后备昵称',
    },
  );

  assert.equal(result.sessionToken, 'session-001');
  assert.equal(storage.getItem('user_session'), 'session-001');

  const nextUser = JSON.parse(storage.getItem('food_order_user') || '{}');
  assert.equal(nextUser.name, '测试用户');
  assert.equal(nextUser.phone, '0600123456');
  assert.equal(nextUser.password, 'secret');
  assert.equal(nextUser.login_account, '0600123456');

  const legacyUser = JSON.parse(storage.getItem('user_info') || '{}');
  assert.equal(legacyUser.name, '测试用户');
  assert.equal(legacyUser.phone, '0600123456');
  assert.equal(legacyUser.login_account, '0600123456');
});

test('persistGoogleUserAuth 同时写入新旧用户存储键', async () => {
  const storage = new MemoryStorage();
  const mod = await import('./user-auth-browser.ts');

  const result = mod.persistGoogleUserAuthWithStorage(storage, {
    id: 'google-001',
    name: '谷歌用户',
    email: 'google@example.com',
    avatar: 'https://example.com/avatar.png',
    phone: '0600999888',
  });

  assert.equal(result.sessionToken, 'google@example.com');
  assert.equal(storage.getItem('user_session'), 'google@example.com');

  const nextUser = JSON.parse(storage.getItem('food_order_user') || '{}');
  assert.equal(nextUser.name, '谷歌用户');
  assert.equal(nextUser.email, 'google@example.com');
  assert.equal(nextUser.google_id, 'google-001');

  const legacyUser = JSON.parse(storage.getItem('user_info') || '{}');
  assert.equal(legacyUser.name, '谷歌用户');
  assert.equal(legacyUser.email, 'google@example.com');
  assert.equal(legacyUser.google_id, 'google-001');
});
