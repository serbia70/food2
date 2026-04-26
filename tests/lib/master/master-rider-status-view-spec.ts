import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMasterRiderStatusView } from '../../../src/lib/master-rider-status-view.ts';

test('buildMasterRiderStatusView 输出 summary 与 group/order 视图', () => {
  const view = buildMasterRiderStatusView({
    summary: {
      total_riders: 3,
      available_riders: 1,
      busy_riders: 1,
      offline_riders: 1,
      active_order_count: 2,
      cod_order_count: 1,
      delivery_fee_total: 180,
      cod_amount_total: 2600,
    },
    groups: {
      available: [
        {
          rider_id: 202,
          name: 'Rider A',
          phone: '381641234567',
          active_order_count: 1,
          cod_order_count: 0,
          delivery_fee_total: 60,
          cod_amount_total: 0,
          orders: [
            {
              order_id: 901,
              order_no: '260901',
              shop_name: 'Shop A',
              status: 'delivering',
              accepted_at: '10:00',
              completed_at: '',
              order_amount: 1200,
              delivery_fee: 60,
              cash_to_collect: 0,
              is_cash_on_delivery: false,
            },
          ],
        },
      ],
    },
  });

  assert.equal(view.summary.totalRiders, 3);
  assert.equal(view.summary.deliveryFeeTotal, 180);
  assert.equal(view.groups.available[0]?.statusLabel, '空闲');
  assert.equal(view.groups.available[0]?.orders[0]?.orderNo, '260901');
  assert.equal(view.groups.available[0]?.orders[0]?.cashTagLabel, '非代收');
});

test('buildMasterRiderStatusView 对缺省值保持稳定 fallback', () => {
  const view = buildMasterRiderStatusView({
    groups: {
      busy: [
        {
          rider_id: null,
          name: null,
          phone: null,
          orders: [
            {
              order_id: null,
              order_no: null,
              shop_id: 77,
              status: null,
              is_cash_on_delivery: true,
            },
          ],
        },
      ],
    },
  });

  assert.equal(view.groups.busy[0]?.id, '');
  assert.equal(view.groups.busy[0]?.name, '未命名骑手');
  assert.equal(view.groups.busy[0]?.phone, '-');
  assert.equal(view.groups.busy[0]?.statusLabel, '送餐中');
  assert.equal(view.groups.busy[0]?.orders[0]?.shopName, '店铺 #77');
  assert.equal(view.groups.busy[0]?.orders[0]?.cashTagLabel, '代收');
});
