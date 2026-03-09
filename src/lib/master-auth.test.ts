import test from 'node:test';
import assert from 'node:assert/strict';

import { MASTER_TOKEN } from '../config.ts';
import { resolveMasterAuth } from './master-auth.ts';

test('优先使用请求头中的 master authorization', () => {
  const request = new Request('http://localhost/master', {
    headers: { Authorization: 'Bearer header-token' },
  });

  const auth = resolveMasterAuth(request, {
    get() {
      return { value: 'cookie-token' };
    },
  }, 'fallback-token');

  assert.equal(auth, 'Bearer header-token');
});

test('请求头缺失时回退到 master_token cookie', () => {
  const request = new Request('http://localhost/master');

  const auth = resolveMasterAuth(request, {
    get(key: string) {
      return key === 'master_token' ? { value: 'cookie-token' } : undefined;
    },
  }, 'fallback-token');

  assert.equal(auth, 'Bearer cookie-token');
});

test('请求头和 cookie 都缺失时回退到默认 token', () => {
  const request = new Request('http://localhost/master');
  const auth = resolveMasterAuth(request, undefined, 'fallback-token');
  assert.equal(auth, 'Bearer fallback-token');
});

test('master fallback token 与后端保持一致', () => {
  assert.equal(MASTER_TOKEN, 'master-token');
});

test('严格模式下没有 header 和 cookie 时不应回退默认 token', () => {
  const request = new Request('http://localhost/master');
  const auth = resolveMasterAuth(request, undefined, 'master-token', { allowFallbackToken: false });
  assert.equal(auth, '');
});
