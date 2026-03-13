import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUserCenterRoute } from './user-center-route.ts';

test('已登录用户个人中心入口应跳到 /user', () => {
  assert.equal(
    resolveUserCenterRoute({ phone: '0613983888888', login_account: '0613983888888' }),
    '/user',
  );
});

test('未登录用户个人中心入口应跳到 /user/login', () => {
  assert.equal(resolveUserCenterRoute(null), '/user/login');
  assert.equal(resolveUserCenterRoute({}), '/user/login');
});
