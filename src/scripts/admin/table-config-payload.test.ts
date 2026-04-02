import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTableConfigPayloadFromRows } from './table-config-payload.ts';

test('buildTableConfigPayloadFromRows: builds normalized zones', () => {
  const payload = buildTableConfigPayloadFromRows([
    { name: '大厅', prefix: '', count: '12' },
    { name: '包间', prefix: 'B', count: 3 },
    { name: '  ', prefix: 'x', count: 0 }, // invalid count -> dropped
  ]);

  assert.deepEqual(payload, {
    table_config: {
      zones: [
        { name: '大厅', prefix: '', count: 12 },
        { name: '包间', prefix: 'B', count: 3 },
      ],
    },
  });
});

test('buildTableConfigPayloadFromRows: uses backend table_config contract', () => {
  const payload = buildTableConfigPayloadFromRows([{ name: '大厅', prefix: '', count: 2 }]);

  assert.ok('table_config' in payload);
  assert.ok(!('tableConfig' in payload));
});
