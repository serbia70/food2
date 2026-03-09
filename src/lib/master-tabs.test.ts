import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMasterPanels } from './master-tabs.ts';

test('切换到全局设置时应只显示 settings 面板', () => {
  const result = resolveMasterPanels('settings');
  assert.deepEqual(result, {
    management: true,
    overview: true,
    settings: false,
  });
});

test('切换到经营总览时应隐藏店铺管理与全局设置', () => {
  const result = resolveMasterPanels('overview');
  assert.deepEqual(result, {
    management: true,
    overview: false,
    settings: true,
  });
});
