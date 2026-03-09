import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyShopResponseStatus } from './shop-status.ts';

test('上游店铺接口 404 时保留 404', () => {
  assert.equal(classifyShopResponseStatus(404), 404);
});

test('上游鉴权失败时转换为 502 便于识别配置问题', () => {
  assert.equal(classifyShopResponseStatus(401), 502);
  assert.equal(classifyShopResponseStatus(403), 502);
});

test('其他异常状态也转换为 502', () => {
  assert.equal(classifyShopResponseStatus(500), 502);
});
