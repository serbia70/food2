import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApiSuccess,
  createApiError,
  isApiSuccess,
  isApiError,
} from './api-envelope.ts';

test('api envelope creates success payloads with ok true and typed data', () => {
  const payload = createApiSuccess({ id: 1, name: 'shop-101' });

  assert.deepEqual(payload, {
    ok: true,
    data: { id: 1, name: 'shop-101' },
  });
  assert.equal(isApiSuccess(payload), true);
  assert.equal(isApiError(payload), false);
});

test('api envelope creates error payloads with code and message', () => {
  const payload = createApiError('unauthorized', '请重新登录');

  assert.deepEqual(payload, {
    ok: false,
    error: {
      code: 'unauthorized',
      message: '请重新登录',
    },
  });
  assert.equal(isApiError(payload), true);
  assert.equal(isApiSuccess(payload), false);
});

test('api envelope creates error payloads with optional details', () => {
  const payload = createApiError('validation_error', '参数错误', {
    field: 'shopId',
    reason: 'required',
  });

  assert.deepEqual(payload, {
    ok: false,
    error: {
      code: 'validation_error',
      message: '参数错误',
      details: {
        field: 'shopId',
        reason: 'required',
      },
    },
  });
  assert.equal(isApiError(payload), true);
  assert.equal(isApiSuccess(payload), false);
});
