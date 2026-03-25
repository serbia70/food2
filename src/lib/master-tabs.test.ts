import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMasterPanels } from './master-tabs.ts';

test('切换到全局设置时应只显示 settings 面板', () => {
  const result = resolveMasterPanels('settings');
  assert.deepEqual(result, {
    shops: true,
    overview: true,
    settings: false,
    backup: true,
  });
});

test('切换到店铺管理时应只显示 shops 面板', () => {
  const result = resolveMasterPanels('shops');
  assert.deepEqual(result, {
    shops: false,
    overview: true,
    settings: true,
    backup: true,
  });
});

test('切换到经营总览时应隐藏店铺管理与全局设置', () => {
  const result = resolveMasterPanels('overview');
  assert.deepEqual(result, {
    shops: true,
    overview: false,
    settings: true,
    backup: true,
  });
});

test('切换到备份设置时应只显示 backup 面板', () => {
  const result = resolveMasterPanels('backup');
  assert.deepEqual(result, {
    shops: true,
    overview: true,
    settings: true,
    backup: false,
  });
});

test('legacy management tab 应映射到 shops 面板', () => {
  const result = resolveMasterPanels('management');
  assert.deepEqual(result, {
    shops: false,
    overview: true,
    settings: true,
    backup: true,
  });
});
