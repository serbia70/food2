import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPhoneConflictGuide } from './user-update-guide.ts';

test('手机号占用时返回退出并重新登录引导', () => {
  const guide = buildPhoneConflictGuide('0613083888');

  assert.equal(guide.title, '手机号已被占用');
  assert.equal(guide.actionLabel, '退出当前账号去登录');
  assert.match(guide.description, /0613083888/);
  assert.equal(guide.loginHref, '/user/login?account=0613083888');
});
