import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCommissionRule } from './master-commission-view.ts';

test('percentage 规则格式化为百分比文案', () => {
  assert.equal(formatCommissionRule('percentage', 3), '3%');
});

test('per_order 规则格式化为每单固定额文案', () => {
  assert.equal(formatCommissionRule('per_order', 35), '每单 35 RSD');
});

test('零值规则格式化为免费', () => {
  assert.equal(formatCommissionRule('percentage', 0), '免费');
});

test('缺失值时返回兜底文案', () => {
  assert.equal(formatCommissionRule('', 0), '免费');
});
