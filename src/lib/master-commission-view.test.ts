import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCommissionRule } from './master-commission-view.ts';

test('percentage 规则格式化为百分比文案', () => {
  assert.equal(formatCommissionRule('percentage', 3), '百分比 3%');
});

test('per_order 规则格式化为每单固定额文案', () => {
  assert.equal(formatCommissionRule('per_order', 35), '每单 35 RSD');
});

test('缺失值时返回兜底文案', () => {
  assert.equal(formatCommissionRule('', 0), '未设置提成规则');
});
