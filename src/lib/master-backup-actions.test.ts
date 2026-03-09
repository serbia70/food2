import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCodeBackups, validateRestoreFilename } from './master-backup-actions.ts';

test('代码备份列表可规范化为空数组', () => {
  assert.deepEqual(normalizeCodeBackups(undefined), []);
  assert.deepEqual(normalizeCodeBackups(null), []);
  assert.deepEqual(normalizeCodeBackups({ backups: [] }), []);
});

test('代码备份返回项可提取 name displayName created', () => {
  assert.deepEqual(
    normalizeCodeBackups([
      {
        name: 'master-backup-2026-03-07.zip',
        displayName: '2026-03-07 晚间备份',
        created: '2026-03-07T18:30:00.000Z',
        size: 1024,
      },
    ]),
    [
      {
        name: 'master-backup-2026-03-07.zip',
        displayName: '2026-03-07 晚间备份',
        created: '2026-03-07T18:30:00.000Z',
      },
    ],
  );
});

test('还原文件校验会拒绝空文件名', () => {
  assert.equal(validateRestoreFilename(''), false);
  assert.equal(validateRestoreFilename('   '), false);
  assert.equal(validateRestoreFilename('master-backup.zip'), true);
});
