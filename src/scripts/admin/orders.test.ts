import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocation = globalThis.location;

async function loadModule() {
  return import('./orders.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
});

test('publishRiderDispatch: 非 JSON 错误响应时抛出原始文本', async () => {
  const hiddenNode = {
    dataset: {
      table: 'addr',
      total: '905',
      status: 'pending',
    },
    closest() {
      return { textContent: 'Tel: 0613083888' };
    },
  };

  globalThis.document = {
    querySelector(selector: string) {
      if (selector.includes('.hidden-data')) return hiddenNode as any;
      return null;
    },
  } as any;

  globalThis.window = {
    __adminRuntime: {
      shopId: 21,
      shopSlug: 'demo-shop',
      shop: { name: 'Demo Shop' },
    },
    __adminHandlers: {},
    dispatchEvent() {},
  } as any;

  globalThis.location = { reload() {} } as any;

  globalThis.fetch = (async () => new Response('Internal Server Error', {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  })) as typeof fetch;

  const mod = await loadModule();

  await assert.rejects(
    () => mod.publishRiderDispatch('463', 15),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).message, 'Internal Server Error');
      return true;
    },
  );
});
