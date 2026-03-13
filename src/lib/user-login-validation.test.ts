import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUserLoginInput } from './user-login-validation.ts';

test('账号或密码为空时返回提示', () => {
	assert.equal(validateUserLoginInput('', '123456'), '请输入账号和密码');
	assert.equal(validateUserLoginInput('888', ''), '请输入账号和密码');
});

test('账号和密码都存在时通过校验', () => {
	assert.equal(validateUserLoginInput('888', '888'), '');
});
