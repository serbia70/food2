import test from 'node:test';
import assert from 'node:assert/strict';

import { MASTER_TOKEN } from '../config.ts';
import { resolveMasterAuth } from './master-auth.ts';

test('resolveMasterAuth 仅暴露 request/cookies 两个入参', () => {
  assert.equal(resolveMasterAuth.length, 2);
});

test('优先使用请求头中的 master authorization', () => {
  const request = new Request('http://localhost/master', {
    headers: { Authorization: 'Bearer header-token' },
  });

  const auth = resolveMasterAuth(request, {
    get() {
      return { value: 'cookie-token' };
    },
  });

  assert.equal(auth, 'Bearer header-token');
});

test('请求头缺失时回退到 master_token cookie', () => {
  const request = new Request('http://localhost/master');

  const auth = resolveMasterAuth(request, {
    get(key: string) {
      return key === 'master_token' ? { value: 'cookie-token' } : undefined;
    },
  });

  assert.equal(auth, 'Bearer cookie-token');
});

test('请求头和 cookie 都缺失时返回空字符串', () => {
  const request = new Request('http://localhost/master');
  const auth = resolveMasterAuth(request);
  assert.equal(auth, '');
});

test('master token 缺失时不应存在可用默认值', () => {
  assert.equal(MASTER_TOKEN, '');
});
