import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthSession } from './auth-session.ts';

test('parseAuthSession accepts canonical camelCase session payload', () => {
  const parsed = parseAuthSession({
    kind: 'master',
    isAuthenticated: true,
    token: 'master-token',
    userId: 7,
    displayName: 'Master',
  });

  assert.equal(parsed.kind, 'master');
  assert.equal(parsed.isAuthenticated, true);
  assert.equal(parsed.token, 'master-token');
  assert.equal(parsed.userId, 7);
  assert.equal(parsed.displayName, 'Master');
});

test('parseAuthSession rejects legacy snake_case payload', () => {
  assert.throws(() =>
    parseAuthSession({
      kind: 'master',
      is_authenticated: true,
      user_id: 7,
      display_name: 'Master',
    }),
  );
});

test('parseAuthSession rejects guest marked as authenticated', () => {
  assert.throws(() =>
    parseAuthSession({
      kind: 'guest',
      isAuthenticated: true,
    }),
  );
});

test('parseAuthSession rejects authenticated non-guest without token or userId', () => {
  assert.throws(() =>
    parseAuthSession({
      kind: 'user',
      isAuthenticated: true,
    }),
  );
});
