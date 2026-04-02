import test from 'node:test';
import assert from 'node:assert/strict';

import { exportData, importData } from './data.ts';

test('importData accepts legacy exported menu field names', async () => {
  const originalFetch = globalThis.fetch;
  const originalAlert = globalThis.alert;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocation = globalThis.location;

  const fetchCalls: Array<{ url: string; body?: any }> = [];
  const alerts: string[] = [];
  const importArea = {
    value: JSON.stringify([
      {
        category: 'Glavna jela',
        category_sub: '主菜',
        items: [
          {
            name: 'Mapo tofu',
            sub_name: '麻婆豆腐',
            price: 1583,
            img: 'https://example.com/a.jpg',
            description: '',
            stock: -1,
            is_available: 1,
          },
        ],
      },
    ]),
  };

  try {
    globalThis.alert = (message?: unknown) => {
      alerts.push(String(message || ''));
    };
    globalThis.window = {} as any;
    globalThis.location = {
      reload() {},
    } as any;
    globalThis.document = {
      getElementById(id: string) {
        if (id === 'import-area') return importArea;
        return null;
      },
    } as any;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const rawBody = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      fetchCalls.push({ url, body: rawBody });
      if (url === '/api/admin/categories') {
        return new Response(JSON.stringify({ ok: true, data: { id: 9, message: 'Category saved' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/admin/products') {
        return new Response(JSON.stringify({ ok: true, data: { message: 'Product saved' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    await importData();

    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(fetchCalls[0], {
      url: '/api/admin/categories',
      body: { name: 'Glavna jela', sub_name: '主菜' },
    });
    assert.deepEqual(fetchCalls[1], {
      url: '/api/admin/products',
      body: {
        name: 'Mapo tofu',
        sub_name: '麻婆豆腐',
        price: 1583,
        img: 'https://example.com/a.jpg',
        description: '',
        stock: -1,
        is_available: 1,
        category_id: 9,
      },
    });
    assert.deepEqual(alerts, ['导入完成：成功 1，失败 0']);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.alert = originalAlert;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.location = originalLocation;
  }
});

test('exportData unwraps canonical menu envelope before building download payload', async () => {
  const originalFetch = globalThis.fetch;
  const originalAlert = globalThis.alert;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalBlob = globalThis.Blob;
  const originalURL = globalThis.URL;

  const clicks: string[] = [];
  const appended: any[] = [];
  let blobText = '';

  const importArea = { value: '' };
  const anchor = {
    href: '',
    download: '',
    click() {
      clicks.push(this.download);
    },
  };

  try {
    globalThis.alert = () => {};
    globalThis.window = {
      location: {
        pathname: '/admin/101',
      },
    } as any;
    globalThis.document = {
      getElementById(id: string) {
        if (id === 'import-area') return importArea;
        return null;
      },
      createElement(tag: string) {
        if (tag === 'a') return anchor;
        throw new Error(`unexpected element: ${tag}`);
      },
      body: {
        appendChild(node: any) {
          appended.push(node);
        },
        removeChild(node: any) {
          const index = appended.indexOf(node);
          if (index >= 0) appended.splice(index, 1);
        },
      },
    } as any;
    globalThis.Blob = class BlobMock {
      constructor(parts: any[]) {
        blobText = parts.map((part) => String(part)).join('');
      }
    } as any;
    globalThis.URL = {
      createObjectURL() {
        return 'blob:mock';
      },
      revokeObjectURL() {},
    } as any;

    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      assert.equal(url, '/101/menu');
      return new Response(JSON.stringify({
        ok: true,
        data: [
          {
            id: 7,
            name: '主食',
            subName: 'Main',
            products: [
              {
                name: 'Fried Rice',
                subName: '炒饭',
                price: 12,
                img: '',
                description: 'ok',
                stock: 5,
                isAvailable: 1,
              },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await exportData();

    assert.equal(clicks.length, 1);
    assert.match(clicks[0], /^menu_export_\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(importArea.value.includes('Fried Rice'), true);
    assert.equal(blobText.includes('Fried Rice'), true);
    assert.equal(blobText.includes('主食'), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.alert = originalAlert;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.Blob = originalBlob;
    globalThis.URL = originalURL;
  }
});
