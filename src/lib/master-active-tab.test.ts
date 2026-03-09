import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMasterTab } from './master-active-tab.ts';

test('允许的 master tab 值应原样保留', () => {
  assert.equal(normalizeMasterTab('management'), 'management');
  assert.equal(normalizeMasterTab('overview'), 'overview');
  assert.equal(normalizeMasterTab('settings'), 'settings');
});

test('未知 tab 值应回退到 management', () => {
  assert.equal(normalizeMasterTab('abc'), 'management');
  assert.equal(normalizeMasterTab(''), 'management');
  assert.equal(normalizeMasterTab(null), 'management');
});
