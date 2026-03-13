import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRetryStream } from './stream-retry.ts';

test('stream 接口返回 404 时不应继续重连', () => {
  assert.equal(shouldRetryStream(404, 'application/json'), false);
});

test('stream 接口返回 410 时不应继续重连', () => {
  assert.equal(shouldRetryStream(410, 'application/json'), false);
});

test('stream 临时异常时仍允许重连', () => {
  assert.equal(shouldRetryStream(502, 'application/json'), true);
  assert.equal(shouldRetryStream(200, 'text/event-stream'), true);
});
