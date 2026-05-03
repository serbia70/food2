import assert from 'node:assert/strict';
import test from 'node:test';

function normalizeAdminOrdersPayloadForTest(data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(data)) return [];
  return data.map((row: unknown) => {
    const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const tableInfo = String(source.tableInfo || '').trim();
    return {
      ...source,
      id: source.id,
      orderNo: source.orderNo ?? source.order_no ?? source.id,
      orderType: source.orderType ?? (tableInfo ? 'dine_in' : ''),
      status: source.status ?? (tableInfo ? 'pending' : ''),
    };
  });
}

test('admin orders normalization prefers order_no over id when orderNo is missing', () => {
  const rows = normalizeAdminOrdersPayloadForTest([
    {
      id: 648,
      order_no: '260415010',
      status: 'awaiting_courier',
    },
  ]);

  assert.equal(rows[0]?.orderNo, '260415010');
});

