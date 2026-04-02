import test from 'node:test';
import assert from 'node:assert/strict';

import { initDefaultStatsDates, loadStats } from './stats.ts';

test('loadStats unwraps canonical stats envelope before rendering summary and table', async () => {
  const originalFetch = globalThis.fetch;
  const originalAlert = globalThis.alert;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  const nodes = new Map<string, any>();
  const tbody = {
    _rows: [] as any[],
    textContent: '',
    appendChild(row: any) {
      this._rows.push(row);
    },
  };
  const table = {
    querySelector(selector: string) {
      return selector === 'tbody' ? tbody : null;
    },
  };

  function createCell() {
    return {
      textContent: '',
      style: {},
      colSpan: 1,
      appendChild() {},
    };
  }

  function createRow() {
    return {
      cells: [] as any[],
      append(...cells: any[]) {
        this.cells.push(...cells);
      },
      appendChild(cell: any) {
        this.cells.push(cell);
      },
    };
  }

  nodes.set('stats-start', { value: '2026-04-01' });
  nodes.set('stats-end', { value: '2026-04-01' });
  nodes.set('stats-type', { value: 'all' });
  nodes.set('val-revenue', { textContent: '0' });
  nodes.set('val-orders', { textContent: '0' });
  nodes.set('stats-table', table);

  try {
    globalThis.alert = () => {};
    globalThis.window = {
      location: {
        pathname: '/admin/101',
        href: '',
      },
    } as any;
    globalThis.document = {
      getElementById(id: string) {
        return nodes.get(id) || null;
      },
      createElement(tag: string) {
        if (tag === 'tr') return createRow();
        return createCell();
      },
    } as any;

    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      data: {
        stats: {
          totalOrders: 3,
          totalRevenue: 1200,
        },
        topItems: [
          { display_name: 'Fish Soup', count: 2, amount: 800 },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await loadStats();

    assert.equal(nodes.get('val-revenue').textContent, '1200');
    assert.equal(nodes.get('val-orders').textContent, '3');
    assert.equal(tbody._rows.length, 1);
    assert.deepEqual(
      tbody._rows[0].cells.map((cell: any) => cell.textContent),
      ['1', 'Fish Soup', '2', '800'],
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.alert = originalAlert;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test('initDefaultStatsDates seeds today without auto loading', () => {
  const originalDocument = globalThis.document;

  const nodes = new Map<string, any>();
  nodes.set('stats-start', { value: '' });
  nodes.set('stats-end', { value: '' });

  try {
    globalThis.document = {
      getElementById(id: string) {
        return nodes.get(id) || null;
      },
    } as any;

    initDefaultStatsDates();

    assert.match(nodes.get('stats-start').value, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(nodes.get('stats-end').value, nodes.get('stats-start').value);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('loadStats retries one time before surfacing fetch failure', async () => {
  const originalFetch = globalThis.fetch;
  const originalAlert = globalThis.alert;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  const nodes = new Map<string, any>();
  const alerts: string[] = [];
  const tbody = {
    _rows: [] as any[],
    textContent: '',
    appendChild(row: any) {
      this._rows.push(row);
    },
  };
  const table = {
    querySelector(selector: string) {
      return selector === 'tbody' ? tbody : null;
    },
  };

  function createCell() {
    return {
      textContent: '',
      style: {},
      colSpan: 1,
      appendChild() {},
    };
  }

  function createRow() {
    return {
      cells: [] as any[],
      append(...cells: any[]) {
        this.cells.push(...cells);
      },
      appendChild(cell: any) {
        this.cells.push(cell);
      },
    };
  }

  nodes.set('stats-start', { value: '2026-04-01' });
  nodes.set('stats-end', { value: '2026-04-01' });
  nodes.set('stats-type', { value: 'all' });
  nodes.set('val-revenue', { textContent: '0' });
  nodes.set('val-orders', { textContent: '0' });
  nodes.set('stats-table', table);

  try {
    let attempts = 0;
    globalThis.alert = (message?: unknown) => {
      alerts.push(String(message || ''));
    };
    globalThis.window = {
      location: {
        pathname: '/admin/101',
        href: '',
      },
    } as any;
    globalThis.document = {
      getElementById(id: string) {
        return nodes.get(id) || null;
      },
      createElement(tag: string) {
        if (tag === 'tr') return createRow();
        return createCell();
      },
    } as any;

    globalThis.fetch = async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({
        ok: true,
        data: {
          stats: {
            totalOrders: 4,
            totalRevenue: 1600,
          },
          topItems: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await loadStats();

    assert.equal(attempts, 2);
    assert.equal(nodes.get('val-revenue').textContent, '1600');
    assert.equal(nodes.get('val-orders').textContent, '4');
    assert.deepEqual(alerts, []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.alert = originalAlert;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
