import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMasterTab } from './master-active-tab.ts';

test('允许的 master tab 值应原样保留（兼容 management -> shops）', () => {
  assert.equal(normalizeMasterTab('management'), 'shops');
  assert.equal(normalizeMasterTab('shops'), 'shops');
  assert.equal(normalizeMasterTab('overview'), 'overview');
  assert.equal(normalizeMasterTab('settings'), 'settings');
  assert.equal(normalizeMasterTab('backup'), 'backup');
  assert.equal(normalizeMasterTab('dispatch'), 'dispatch');
  assert.equal(normalizeMasterTab('riders'), 'riders');
});

test('未知 tab 值应回退到 overview', () => {
  assert.equal(normalizeMasterTab('abc'), 'overview');
  assert.equal(normalizeMasterTab(''), 'overview');
  assert.equal(normalizeMasterTab(null), 'overview');
});
