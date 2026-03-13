import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPhoneUpdatePayload, applyLocalNicknameUpdate } from './user-profile-update.ts';

test('手机号修改请求体应包含 login_account 和 phone', () => {
  assert.deepEqual(
    buildPhoneUpdatePayload({ login_account: '888', phone: '888' }, '0613983888888'),
    { login_account: '888', phone: '0613983888888' },
  );
});

test('昵称修改先只更新本地用户对象', () => {
  const updated = applyLocalNicknameUpdate({ name: '888', phone: '888' }, '海鲜老饕');
  assert.equal(updated.name, '海鲜老饕');
  assert.equal(updated.phone, '888');
});
