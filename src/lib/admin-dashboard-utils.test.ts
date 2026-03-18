import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asObject,
  parseMaybeJSON,
  normalizeJSONString,
  parseDBDateMs,
  formatHHmm,
  resolveTableConfig,
  buildTableCards,
} from './admin-dashboard-utils.ts';

test('asObject: returns {} for non-object values', () => {
  assert.deepEqual(asObject(null), {});
  assert.deepEqual(asObject(undefined), {});
  assert.deepEqual(asObject(1), {});
  assert.deepEqual(asObject('x'), {});
  assert.deepEqual(asObject([1, 2]), {});
});

test('asObject: returns the same object for plain object', () => {
  const o = { a: 1 };
  assert.equal(asObject(o), o);
});

test('parseMaybeJSON: passes through non-string', () => {
  assert.equal(parseMaybeJSON(1 as any), 1);
  assert.deepEqual(parseMaybeJSON({ a: 1 } as any), { a: 1 });
});

test('parseMaybeJSON: trims and parses JSON strings; empty string -> null; invalid -> null', () => {
  assert.deepEqual(parseMaybeJSON(' {"a":1} '), { a: 1 });
  assert.equal(parseMaybeJSON('   '), null);
  assert.equal(parseMaybeJSON('not-json'), null);
});

test('normalizeJSONString: nullish -> fallback', () => {
  assert.equal(normalizeJSONString(null as any, '[]'), '[]');
  assert.equal(normalizeJSONString(undefined as any, '{}'), '{}');
});

test('normalizeJSONString: string JSON -> canonical JSON.stringify(parsed)', () => {
  assert.equal(normalizeJSONString(' {"a":1} ', '{}'), '{"a":1}');
});

test('normalizeJSONString: invalid string -> fallback', () => {
  assert.equal(normalizeJSONString('oops', '[]'), '[]');
});

test('normalizeJSONString: object -> JSON.stringify(object); stringify error -> fallback', () => {
  assert.equal(normalizeJSONString({ a: 1 }, '{}'), '{"a":1}');
  const cyclic: any = {};
  cyclic.self = cyclic;
  assert.equal(normalizeJSONString(cyclic, '{}'), '{}');
});

test('parseDBDateMs: empty -> 0', () => {
  assert.equal(parseDBDateMs(null as any), 0);
  assert.equal(parseDBDateMs(''), 0);
  assert.equal(parseDBDateMs('   '), 0);
});

test('parseDBDateMs: parses db date with space separator by converting to ISO', () => {
  const ms = parseDBDateMs('2026-03-18 10:11:12');
  assert.ok(ms > 0);
});

test('formatHHmm: empty -> --:--', () => {
  assert.equal(formatHHmm(''), '--:--');
});

test('formatHHmm: formats to HH:mm in Europe/Belgrade (sr-RS)', () => {
  const v = '2026-03-18 10:11:12';
  const out = formatHHmm(v);
  assert.match(out, /^\d{2}:\d{2}$/);
});

test('resolveTableConfig: uses shop.table_config JSON zones when present (single hall-like zone clears prefix)', () => {
  const shop = {
    table_config: JSON.stringify({ zones: [{ name: '大厅', prefix: '大厅', count: 3 }] }),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: '大厅', prefix: '', count: 3 }]);
});

test('resolveTableConfig: clamps count and trims strings', () => {
  const shop = {
    table_config: JSON.stringify([{ name: ' A ', prefix: ' B ', count: 999 }]),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: 'A', prefix: 'B', count: 300 }]);
});

test('resolveTableConfig: falls back to settings.tables array', () => {
  const settings = { tables: [{ name: 'Zone', prefix: 'Z', count: 2 }] };
  const out = resolveTableConfig({}, settings);
  assert.deepEqual(out, [{ name: 'Zone', prefix: 'Z', count: 2 }]);
});

test('resolveTableConfig: default fallback when no candidates', () => {
  const out = resolveTableConfig({}, {});
  assert.deepEqual(out, [{ name: '大厅', prefix: '', count: 12 }]);
});

test('resolveTableConfig: removes placeholder zone name using isPlaceholderZoneName', () => {
  const shop = {
    table_config: JSON.stringify({ zones: [{ name: '区域1', prefix: '区域1', count: 3 }] }),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: '', prefix: '', count: 3 }]);
});

test('resolveTableConfig: removes placeholder zone prefix using isPlaceholderZoneName', () => {
  const shop = {
    table_config: JSON.stringify({ zones: [{ name: '大厅', prefix: '区域2', count: 3 }] }),
  };
  const out = resolveTableConfig(shop, {});
  assert.deepEqual(out, [{ name: '大厅', prefix: '', count: 3 }]);
});

test('buildTableCards: filters active dine-in and marks newest as isNew', () => {
  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;

  try {
    const tableConfig = [{ name: '大厅', prefix: '', count: 1 }];
    const orders = [
      {
        id: 1,
        order_type: 'dine_in',
        status: 'pending',
        is_deleted: 0,
        table_info: '1号桌',
        created_at: '2026-03-18 10:11:12',
        total_amount: 10,
      },
      {
        id: 2,
        order_type: 'delivery',
        status: 'pending',
        is_deleted: 0,
        table_info: '1号桌',
        created_at: '2026-03-18 10:11:30',
        total_amount: 20,
      },
    ];

    const cards = buildTableCards(orders as any[], tableConfig as any);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].hasOrder, true);
    assert.equal(cards[0].isNew, true);
  } finally {
    Date.now = originalNow;
  }
});
