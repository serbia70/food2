import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUserApiUrl } from './user-api-route.ts';

test('login 路由应转发到 user login 接口', () => {
  assert.equal(
    buildUserApiUrl('https://api.serbia70.com', 'login'),
    'https://api.serbia70.com/api/user/login',
  );
});

test('register 路由应转发到 user register 接口', () => {
  assert.equal(
    buildUserApiUrl('https://api.serbia70.com', 'register'),
    'https://api.serbia70.com/api/user/register',
  );
});

test('history get 路由应保留 query string', () => {
  assert.equal(
    buildUserApiUrl('https://api.serbia70.com', 'history', 'phone=0600&page=1'),
    'https://api.serbia70.com/api/user/history?phone=0600&page=1',
  );
});
