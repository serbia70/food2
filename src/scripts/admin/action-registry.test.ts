import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeAdminAction } from './action-registry.ts';

test('invokeAdminAction: calls function by action and returns true', async () => {
  const calls: any[] = [];
  const registry = {
    'import-data': (...args: any[]) => {
      calls.push(args);
    },
  };

  const handled = await invokeAdminAction(registry, 'import-data', 1, 'x');

  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [1, 'x']);
});

test('invokeAdminAction: returns false when action missing or non-function', async () => {
  assert.equal(await invokeAdminAction({}, 'missing'), false);
  assert.equal(await invokeAdminAction({ a: 123 }, 'a'), false);
  assert.equal(await invokeAdminAction(null as any, 'a'), false);
  assert.equal(await invokeAdminAction({ a: () => {} }, ''), false);
});

test('invokeAdminAction: awaits async handlers', async () => {
  let called = false;
  const registry = {
    a: async () => {
      await Promise.resolve();
      called = true;
    },
  };

  const handled = await invokeAdminAction(registry, 'a');

  assert.equal(handled, true);
  assert.equal(called, true);
});
