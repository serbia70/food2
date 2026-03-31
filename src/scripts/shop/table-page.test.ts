import test from 'node:test';
import assert from 'node:assert/strict';

import { initTablePage } from './table-page.ts';

test('initTablePage registers table actions on window', () => {
  const originalWindow = globalThis.window;

  const fakeWindow = {
    location: { href: '' },
    dispatchEvent() {},
  } as any;

  globalThis.window = fakeWindow;

  try {
    initTablePage({ slug: '101' });

    assert.equal(typeof fakeWindow.openTableOrder, 'function');
    assert.equal(typeof fakeWindow.openTableAdd, 'function');
    assert.equal(typeof fakeWindow.openTableDetails, 'function');
    assert.equal(typeof fakeWindow.closeTableDetailsModal, 'function');
    assert.equal(typeof fakeWindow.goToDeliveryMode, 'function');
    assert.equal(typeof fakeWindow.openReservationModal, 'function');
  } finally {
    globalThis.window = originalWindow;
  }
});
