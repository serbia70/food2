import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const scriptPath = resolve(process.cwd(), 'src/scripts/admin/settings-ui.ts');

type AnyRecord = Record<string, any>;

class MockElement {
  tagName: string;
  dataset: AnyRecord = {};
  style: AnyRecord = {};
  className = '';
  textContent = '';
  innerHTML = '';
  type = '';
  value = '';
  checked = false;
  children: MockElement[] = [];
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }

  append(...nodes: MockElement[]) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: MockElement[]) {
    this.children = [...nodes];
    this.innerHTML = '';
  }

  addEventListener(type: string, handler: (...args: any[]) => void) {
    const queue = this.listeners.get(type) || [];
    queue.push(handler);
    this.listeners.set(type, queue);
  }

  querySelector(selector: string): MockElement | null {
    if (selector === '[data-admin-action="test-rider-telegram"]') {
      return this.findByAction('test-rider-telegram');
    }
    return null;
  }

  private findByAction(action: string): MockElement | null {
    for (const child of this.children) {
      if (child.dataset?.adminAction === action) return child;
      const nested = child.findByAction(action);
      if (nested) return nested;
    }
    return null;
  }

  toMarkup(): string {
    const attrs: string[] = [];
    if (this.dataset.adminAction) attrs.push(`data-admin-action="${this.dataset.adminAction}"`);
    if (this.dataset.riderName) attrs.push(`data-rider-name="${this.dataset.riderName}"`);
    if (this.dataset.riderPhone) attrs.push(`data-rider-phone="${this.dataset.riderPhone}"`);
    if (this.dataset.riderChatId) attrs.push(`data-rider-chat-id="${this.dataset.riderChatId}"`);
    const open = `<${this.tagName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
    const children = this.children.map((node) => node.toMarkup()).join('');
    return `${open}${this.innerHTML || this.textContent || ''}${children}</${this.tagName}>`;
  }
}

async function loadInitSettingsUI() {
  let source = await readFile(scriptPath, 'utf8');
  source = source.replace(
    "import { getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';",
    `const getAdminRuntimeState = () => (typeof window === 'undefined' ? {} : (window.__adminRuntime || {}));
const getAdminHandlers = () => {
  if (typeof window === 'undefined') return {};
  return (window.__adminHandlers ||= {});
};
const registerAdminGlobal = (name, handler, exposeOnWindow = true) => {
  if (typeof window === 'undefined') return handler;
  const registry = getAdminHandlers();
  registry[name] = handler;
  if (exposeOnWindow) window[name] = handler;
  return handler;
};
const showAdminToast = (message) => {
  const toast = (typeof window !== 'undefined' && window.__adminHandlers && window.__adminHandlers.showToast) || window.showToast;
  if (typeof toast === 'function') {
    toast(message);
    return;
  }
};`,
  );
  source = source.replace(
    "import { buildTableConfigPayloadFromDOM } from './table-config-payload';",
    'const buildTableConfigPayloadFromDOM = () => ({ zones: [] });',
  );

  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  return mod.initSettingsUI as (onSaved: () => void) => void;
}

function hasText(node: MockElement, text: string): boolean {
  if (String(node.textContent || '').includes(text)) return true;
  if (String(node.innerHTML || '').includes(text)) return true;
  return node.children.some((child) => hasText(child, text));
}

function installMockDom() {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocation = globalThis.location;

  const nodes = new Map<string, MockElement>();
  const listEl = new MockElement('div');
  const summaryEl = new MockElement('div');
  const settingsForm = new MockElement('form');
  const tokenInput = new MockElement('input');
  tokenInput.value = '';

  settingsForm.querySelector = (selector: string) => {
    if (selector === 'input[name="tg_token"]') return tokenInput;
    return null;
  };

  nodes.set('drivers-list', listEl);
  nodes.set('drivers-dispatch-summary', summaryEl);
  nodes.set('settings-form', settingsForm);

  const handlers: AnyRecord = {};
  globalThis.window = {
    __adminRuntime: { shopSlug: 'shop-101' },
    __adminHandlers: handlers,
    showToast: () => {},
    location: {
      pathname: '/admin/101',
      href: '',
      reload() {},
    },
  } as any;
  handlers.showToast = (message: string) => (globalThis.window as any).showToast(message);

  globalThis.location = globalThis.window.location as any;

  globalThis.document = {
    getElementById(id: string) {
      return nodes.get(id) || null;
    },
    createElement(tag: string) {
      return new MockElement(tag);
    },
    querySelector() {
      return null;
    },
  } as any;

  return {
    listEl,
    settingsForm,
    tokenInput,
    restore() {
      globalThis.fetch = originalFetch;
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.location = originalLocation;
    },
  };
}

test('load-drivers renders telegram test action for bound riders only', async () => {
  const ctx = installMockDom();

  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
            { name: '骑手B', phone: '222', status: 'available', telegramChatId: '' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const html = ctx.listEl.toMarkup();
    assert.match(html, /测试 Telegram/);
    assert.match(html, /陈工/);

    const riderBRow = ctx.listEl.children.find((row) => hasText(row, '骑手B'));
    assert.ok(riderBRow);
    assert.doesNotMatch(riderBRow.toMarkup(), /测试 Telegram/);
  } finally {
    ctx.restore();
  }
});

test('clicking rider telegram test action sends request and shows success toast', async () => {
  const ctx = installMockDom();
  const toasts: string[] = [];
  let postBody: AnyRecord | null = null;

  try {
    (globalThis.window as any).showToast = (message: string) => {
      toasts.push(String(message));
    };

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/rider-telegram-test') {
        assert.equal(init?.method, 'POST');
        postBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const button = ctx.listEl.querySelector('[data-admin-action="test-rider-telegram"]');
    assert.ok(button);
    ctx.tokenInput.value = 'dom-inline-token';
    (globalThis.window as any).__adminRuntime.currentSettings = {};

    await (globalThis.window as any).__adminHandlers['test-rider-telegram'](button);

    assert.equal(postBody?.riderName, '陈工');
    assert.equal(postBody?.riderChatId, 'chat-1');
    assert.equal(postBody?.telegramBotToken, 'dom-inline-token');
    assert.ok(toasts.some((message) => message.includes('测试消息已发送')));
  } finally {
    ctx.restore();
  }
});

test('clicking rider telegram test action falls back to runtime shop telegramToken', async () => {
  const ctx = installMockDom();
  let postBody: AnyRecord | null = null;

  try {
    (globalThis.window as any).__adminRuntime.currentSettings = {};
    (globalThis.window as any).__adminRuntime.shop = { telegramToken: 'shop-runtime-token' };

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/rider-telegram-test') {
        postBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const button = ctx.listEl.querySelector('[data-admin-action="test-rider-telegram"]');
    assert.ok(button);

    await (globalThis.window as any).__adminHandlers['test-rider-telegram'](button);

    assert.equal(postBody?.telegramBotToken, 'shop-runtime-token');
  } finally {
    ctx.restore();
  }
});

test('clicking rider telegram test action logs frontend token sources on failure', async () => {
  const ctx = installMockDom();
  const consoleCalls: AnyRecord[] = [];
  const originalConsoleError = console.error;

  try {
    console.error = (...args: any[]) => {
      consoleCalls.push(args);
    };

    (globalThis.window as any).__adminRuntime.currentSettings = {
      telegram: { chatId: 'only-chat-id' },
      __debugMasterSettings: {
        topLevelKeys: ['success', 'telegram', 'server'],
        telegramKeys: [],
        serverKeys: [],
        successValue: true,
      },
    };
    (globalThis.window as any).__adminRuntime.shop = { telegramChatId: 'shop-chat-only' };
    ctx.tokenInput.value = '';

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/rider-telegram-test') {
        return new Response(JSON.stringify({
          success: false,
          error: 'telegram_bot_token_not_configured',
          tokenSource: 'missing_after_shop_master_admin_home_fallback',
          diagnostics: {
            shopInfo: { requested: true, tokenFound: false },
            masterSettings: { requested: true, status: 401, tokenFound: false },
            adminMasterSettings: { requested: true, status: 200, tokenFound: false, responsePreview: '{"success":true}' },
            homeSettings: { requested: true, status: 200, tokenFound: false },
          },
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const button = ctx.listEl.querySelector('[data-admin-action="test-rider-telegram"]');
    assert.ok(button);

    await (globalThis.window as any).__adminHandlers['test-rider-telegram'](button);

    assert.ok(consoleCalls.some((args) => String(args[0]).includes('[admin/rider-telegram-test]')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('missing_after_shop_master_admin_home_fallback')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('frontendTokenSources')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('formTokenPresent')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('runtimeTelegramKeys')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('shopTelegramKeys')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('__debugMasterSettings')));
    assert.ok(consoleCalls.some((args) => JSON.stringify(args).includes('topLevelKeys')));
    assert.ok(consoleCalls.some((args) => typeof args[2] === 'string' && args[2].includes('"inlineTokenPresent":false')));
    assert.ok(consoleCalls.some((args) => typeof args[2] === 'string' && args[2].includes('"shopTokenPresent":false')));
  } finally {
    console.error = originalConsoleError;
    ctx.restore();
  }
});

test('clicking rider telegram test action shows connectivity timeout details from backend', async () => {
  const ctx = installMockDom();
  const toasts: string[] = [];

  try {
    (globalThis.window as any).showToast = (message: string) => {
      toasts.push(String(message));
    };

    (globalThis.window as any).__adminRuntime.currentSettings = {};
    (globalThis.window as any).__adminRuntime.shop = {};

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/rider-telegram-test') {
        return new Response(JSON.stringify({
          success: false,
          error: 'telegram_send_failed',
          message: 'fetch failed',
          cause: 'Connect Timeout Error (attempted address: api.telegram.org:443, timeout: 10000ms)',
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const button = ctx.listEl.querySelector('[data-admin-action="test-rider-telegram"]');
    assert.ok(button);

    await (globalThis.window as any).__adminHandlers['test-rider-telegram'](button);

    assert.ok(toasts.some((message) => message.includes('telegram_send_failed')));
    assert.ok(toasts.some((message) => message.includes('UND_ERR_CONNECT_TIMEOUT')));
    assert.ok(toasts.some((message) => message.includes('Connect Timeout Error')));
  } finally {
    ctx.restore();
  }
});

test('clicking rider telegram test action keeps backend message when code and cause are missing', async () => {
  const ctx = installMockDom();
  const toasts: string[] = [];

  try {
    (globalThis.window as any).showToast = (message: string) => {
      toasts.push(String(message));
    };

    (globalThis.window as any).__adminRuntime.currentSettings = {};
    (globalThis.window as any).__adminRuntime.shop = {};

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === '/api/rider/status?action=list_available') {
        return new Response(JSON.stringify({
          riders: [
            { name: '陈工', phone: '111', status: 'available', telegramChatId: 'chat-1' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/rider-telegram-test') {
        return new Response(JSON.stringify({
          success: false,
          error: 'telegram_send_failed',
          message: 'fetch_failed',
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const initSettingsUI = await loadInitSettingsUI();
    initSettingsUI(() => {});
    await (globalThis.window as any).__adminHandlers['load-drivers']();

    const button = ctx.listEl.querySelector('[data-admin-action="test-rider-telegram"]');
    assert.ok(button);

    await (globalThis.window as any).__adminHandlers['test-rider-telegram'](button);

    assert.ok(toasts.includes('telegram_send_failed | fetch_failed'));
  } finally {
    ctx.restore();
  }
});
