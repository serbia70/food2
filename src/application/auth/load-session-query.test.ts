import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiSuccess } from '../../domain/api/api-envelope.ts';

test('createSessionPayload 生成已登录 master 会话 payload', async () => {
  const { createSessionPayload } = await import('./load-session-query.ts');

  const payload = createSessionPayload({
    kind: 'master',
    token: 'master-token',
    userId: 1,
    displayName: 'Master',
  });

  assert.deepEqual(payload, {
    kind: 'master',
    isAuthenticated: true,
    token: 'master-token',
    userId: 1,
    displayName: 'Master',
  });
});

test('createGuestSessionPayload 生成游客会话 payload', async () => {
  const { createGuestSessionPayload } = await import('./load-session-query.ts');

  assert.deepEqual(createGuestSessionPayload(), {
    kind: 'guest',
    isAuthenticated: false,
  });
});

test('session payload 由路由通过 canonical helper 包装', async () => {
  const { createSessionPayload } = await import('./load-session-query.ts');

  const responseBody = createApiSuccess(createSessionPayload({
    kind: 'admin',
    token: 'admin-token',
    userId: 21,
  }));

  assert.deepEqual(responseBody, {
    ok: true,
    data: {
      kind: 'admin',
      isAuthenticated: true,
      token: 'admin-token',
      userId: 21,
    },
  });
});
