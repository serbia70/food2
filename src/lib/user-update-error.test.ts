import test from 'node:test';
import assert from 'node:assert/strict';

import { mapUserUpdateErrorMessage } from './user-update-error.ts';

test('update failed 映射为手机号冲突提示', () => {
  assert.equal(
    mapUserUpdateErrorMessage({ error: 'update failed' }),
    '手机号更新失败，可能该手机号已被其他账号使用',
  );
});

test('缺少必填字段映射为可读提示', () => {
	assert.equal(
		mapUserUpdateErrorMessage({ error: 'login_account/phone required' }),
		'请填写完整的登录账号和手机号',
	);
});

test('phone already in use 映射为手机号已占用提示', () => {
	assert.equal(
		mapUserUpdateErrorMessage({ error: 'phone already in use' }),
		'该手机号已被其他账号使用，请先退出当前账号，再用该手机号登录',
	);
});
