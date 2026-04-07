import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISPATCH_AUTO_REASSIGN_MINUTES,
  parsePositiveIntConfig,
} from './config.ts';

test('DISPATCH_AUTO_REASSIGN_MINUTES 默认是合法正整数', () => {
  assert.equal(DISPATCH_AUTO_REASSIGN_MINUTES >= 1, true);
});

test('parsePositiveIntConfig 在空值时回退默认值 5', () => {
  assert.equal(parsePositiveIntConfig(undefined, 5), 5);
  assert.equal(parsePositiveIntConfig('', 5), 5);
});

test('parsePositiveIntConfig 读取合法 env 数值', () => {
  assert.equal(parsePositiveIntConfig('10', 5), 10);
  assert.equal(parsePositiveIntConfig(' 7 ', 5), 7);
});

test('parsePositiveIntConfig 对非法或非正整数输入回退默认值', () => {
  assert.equal(parsePositiveIntConfig('abc', 5), 5);
  assert.equal(parsePositiveIntConfig('0', 5), 5);
  assert.equal(parsePositiveIntConfig('-1', 5), 5);
  assert.equal(parsePositiveIntConfig('1.5', 5), 5);
});
