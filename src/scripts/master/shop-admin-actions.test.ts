import test from 'node:test';
import assert from 'node:assert/strict';

import { initMasterShopAdminActions } from './shop-admin-actions.ts';

type FetchCall = { url: string; init?: RequestInit };

type AlertFn = (message: string) => void;

type ReloadFn = () => void;

type MasterDangerConfirmOptions = {
  onConfirm: () => Promise<void>;
};

function setupWindowHarness(options: {
  fetchImpl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
  alertFn?: AlertFn;
  reloadFn?: ReloadFn;
}) {
  const originalWindow = globalThis.window;
  const originalWindowAlert = originalWindow?.alert;
  const originalAlert = globalThis.alert;
  const originalFetch = globalThis.fetch;

  const alerts: string[] = [];
  const reloadMarks: string[] = [];
  const pending: Array<Promise<unknown>> = [];

  const fakeWindow = {
    confirm: () => true,
    location: {
      href: '',
      reload: () => {
        reloadMarks.push('reload');
        options.reloadFn?.();
      },
    },
    masterDangerConfirm: {
      open: (confirmOptions: MasterDangerConfirmOptions) => {
        const work = (async () => {
          try {
            await confirmOptions.onConfirm();
            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : '删除店铺失败';
            alertImpl(message);
            return false;
          }
        })();
        pending.push(work);
        return work;
      },
    },
  };

  const alertImpl = (message: string) => {
    alerts.push(message);
    options.alertFn?.(message);
  };

  fakeWindow.alert = alertImpl;
  globalThis.window = fakeWindow as any;
  globalThis.alert = alertImpl as any;
  globalThis.fetch = options.fetchImpl as typeof fetch;

  return {
    alerts,
    reloadMarks,
    async flush() {
      await Promise.all(pending);
    },
    restore() {
      if (originalWindow && originalWindowAlert) {
        originalWindow.alert = originalWindowAlert;
      }
      globalThis.window = originalWindow as any;
      globalThis.alert = originalAlert as any;
      globalThis.fetch = originalFetch;
    },
  };
}

test('deleteMasterShop reads canonical error envelope message', async () => {
  const calls: FetchCall[] = [];
  const harness = setupWindowHarness({
    fetchImpl: async (url, init) => {
      const requestUrl = String(url instanceof Request ? url.url : url);
      calls.push({ url: requestUrl, init });
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: 'shop_delete_failed',
          message: '店铺删除被拒绝',
        },
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  try {
    const actions = initMasterShopAdminActions({
      isUnauthorizedResponse: () => false,
      handleMasterUnauthorized: async () => {},
    });

    actions.deleteMasterShop(11, 'Shop 11');
    await harness.flush();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/master/shops/11');
    assert.equal(calls[0].init?.method, 'DELETE');
    assert.deepEqual(harness.alerts, ['店铺删除被拒绝']);
    assert.equal(harness.reloadMarks.length, 0);
  } finally {
    harness.restore();
  }
});

test('deleteMasterShop falls back to default message for non-canonical error body', async () => {
  const harness = setupWindowHarness({
    fetchImpl: async () => new Response(JSON.stringify({ success: false, error: 'legacy error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  try {
    const actions = initMasterShopAdminActions({
      isUnauthorizedResponse: () => false,
      handleMasterUnauthorized: async () => {},
    });

    actions.deleteMasterShop(12, 'Shop 12');
    await harness.flush();

    assert.deepEqual(harness.alerts, ['删除店铺失败']);
    assert.equal(harness.reloadMarks.length, 0);
  } finally {
    harness.restore();
  }
});

test('deleteMasterShop falls back to default message for partial canonical error body missing code', async () => {
  const harness = setupWindowHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      error: {
        message: '不应直接透传',
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  try {
    const actions = initMasterShopAdminActions({
      isUnauthorizedResponse: () => false,
      handleMasterUnauthorized: async () => {},
    });

    actions.deleteMasterShop(12, 'Shop 12');
    await harness.flush();

    assert.deepEqual(harness.alerts, ['删除店铺失败']);
    assert.equal(harness.reloadMarks.length, 0);
  } finally {
    harness.restore();
  }
});

test('deleteMasterShop falls back to default message for partial canonical error body missing message', async () => {
  const harness = setupWindowHarness({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'shop_delete_failed',
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  try {
    const actions = initMasterShopAdminActions({
      isUnauthorizedResponse: () => false,
      handleMasterUnauthorized: async () => {},
    });

    actions.deleteMasterShop(12, 'Shop 12');
    await harness.flush();

    assert.deepEqual(harness.alerts, ['删除店铺失败']);
    assert.equal(harness.reloadMarks.length, 0);
  } finally {
    harness.restore();
  }
});

test('deleteMasterShop success path keeps existing behavior', async () => {
  const harness = setupWindowHarness({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, data: { deleted: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  try {
    const actions = initMasterShopAdminActions({
      isUnauthorizedResponse: () => false,
      handleMasterUnauthorized: async () => {},
    });

    actions.deleteMasterShop(13, 'Shop 13');
    await harness.flush();

    assert.deepEqual(harness.alerts, ['店铺已删除，页面将刷新']);
    assert.equal(harness.reloadMarks.length, 1);
  } finally {
    harness.restore();
  }
});
