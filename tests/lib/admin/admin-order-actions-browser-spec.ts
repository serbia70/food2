import assert from 'node:assert/strict';
import test from 'node:test';

type AssignHandler = (el: HTMLElement) => Promise<void> | void;

type AdminWindowStub = {
  __adminHandlers?: Record<string, AssignHandler>;
  __adminRuntime?: {
    shopSlug?: string;
  };
  __adminAssignInFlight?: boolean;
  __adminPendingOrderRefresh?: boolean;
  showToast?: (message: string) => void;
  refreshOrderList?: () => void;
  dispatchEvent?: (event: Event) => boolean;
};

type HiddenDatasetElement = {
  dataset?: Record<string, string>;
};

function createJsonResponse(payload: unknown, status = 200): Response {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => payload,
    text: async () => text,
  } as Response;
}

test('assign-rider browser handler forwards snake_case telegram chat id to manual_assign payload', async () => {
  const globalScope = globalThis as typeof globalThis & {
    window?: AdminWindowStub;
    document?: Document;
    fetch?: typeof fetch;
    prompt?: typeof prompt;
  };
  const originalWindow = globalScope.window;
  const originalDocument = globalScope.document;
  const originalFetch = globalScope.fetch;
  const originalPrompt = globalScope.prompt;

  const promptAnswers = ['1', '1'];
  const assignBodies: string[] = [];
  const hiddenOrderNode: HiddenDatasetElement = {
    dataset: {
      orderId: '501',
      remarks: '',
    },
  };
  const windowStub: AdminWindowStub = {
    __adminHandlers: {},
    __adminRuntime: { shopSlug: '103' },
    dispatchEvent: () => true,
  };
  const documentStub = {
    querySelector(selector: string) {
      if (selector === '.hidden-data[data-order-id="501"]') return hiddenOrderNode as unknown as Element;
      if (selector === '.hidden-data[data-oid="501"]') return hiddenOrderNode as unknown as Element;
      return null;
    },
  } as unknown as Document;

  globalScope.window = windowStub;
  globalScope.document = documentStub;
  globalScope.prompt = (() => promptAnswers.shift() ?? null) as typeof prompt;
  globalScope.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === '/api/rider/status?action=list_available') {
      return createJsonResponse({
        success: true,
        riders: [
          {
            id: '202',
            name: 'Rider 1',
            phone: '381641234567',
            status: 'available',
            telegram_chat_id: 'chat-snake',
          },
        ],
      });
    }

    if (url === '/api/admin/rider-assign') {
      assignBodies.push(typeof init?.body === 'string' ? init.body : '');
      return createJsonResponse({ success: true });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const moduleUrl = new URL(`../../../src/scripts/admin/order-actions.ts?assign-rider-browser=${Date.now()}`, import.meta.url).href;

  try {
    await import(moduleUrl);
    windowStub.refreshOrderList = () => {};
    const handler = windowStub.__adminHandlers?.['assign-rider'];
    assert.equal(typeof handler, 'function');

    await handler?.({ dataset: { orderId: '501' } } as unknown as HTMLElement);

    assert.equal(assignBodies.length, 1);
    const payload = JSON.parse(assignBodies[0] || '{}') as Record<string, unknown>;
    assert.equal(payload.action, 'manual_assign');
    assert.equal(payload.orderId, '501');
    assert.equal(payload.riderId, '202');
    assert.equal(payload.shopSlug, '103');
    assert.equal(payload.pickupEtaMinutes, 10);
    assert.equal(payload.riderTelegramChatId, 'chat-snake');
  } finally {
    globalScope.window = originalWindow;
    globalScope.document = originalDocument;
    globalScope.fetch = originalFetch;
    globalScope.prompt = originalPrompt;
  }
});

