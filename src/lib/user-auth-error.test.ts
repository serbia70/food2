import test from 'node:test';
import assert from 'node:assert/strict';

import { mapUserAuthErrorMessage } from './user-auth-error.ts';

test('优先显示后端 invalid credentials 语义化文案', () => {
  assert.equal(mapUserAuthErrorMessage({ error: 'invalid credentials' }), '账号或密码错误');
});

test('未知错误时回退到默认文案', () => {
  assert.equal(mapUserAuthErrorMessage({}), '操作失败，请稍后重试');
});
