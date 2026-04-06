import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildContactableRiderRows,
  buildDispatchPublishPayload,
  buildReminderPayload,
  filterAvailableRidersForOrder,
  filterRiderActiveOrders,
  filterRiderDashboardOrders,
  formatPickupEtaLabel,
  getAdminDispatchStatusCopy,
  getReminderBadgeCopy,
  getRiderStatusHintCopy,
  isAwaitingCourierOrder,
  isRiderClaimableOrder,
  pickAvailableRiders,
  readDispatchMetaFromRemarks,
  shouldEscalateUnclaimedOrder,
} from './rider-dispatch.ts';

test('formatPickupEtaLabel 返回紧凑 ETA 文案', () => {
  assert.equal(formatPickupEtaLabel(15), '约 15 分钟后可取');
  assert.equal(formatPickupEtaLabel(0), '');
  assert.equal(formatPickupEtaLabel(undefined), '');
});

test('isAwaitingCourierOrder 仅识别 awaiting_courier', () => {
  assert.equal(isAwaitingCourierOrder({ status: 'awaiting_courier' }), true);
  assert.equal(isAwaitingCourierOrder({ status: 'pending' }), false);
});

test('isRiderClaimableOrder 仅按 awaiting_courier 判断可抢单', () => {
  assert.equal(isRiderClaimableOrder({ status: 'awaiting_courier', courier_phone: '' }), true);
  assert.equal(isRiderClaimableOrder({ status: 'awaiting_courier', courier_phone: '06123' }), true);
  assert.equal(isRiderClaimableOrder({ status: 'awaiting_courier', courierPhone: '06123' }), true);
  assert.equal(isRiderClaimableOrder({ status: 'pending', courier_phone: '' }), false);
});

test('pickAvailableRiders 仅保留 available 且有手机号的骑手', () => {
  const riders = [
    { id: 1, name: 'A', phone: '061', status: 'available' as const },
    { id: 2, name: 'B', phone: '', status: 'available' as const },
    { id: 3, name: 'C', phone: '062', status: 'busy' as const },
  ];

  assert.deepEqual(pickAvailableRiders(riders), [{ id: 1, name: 'A', phone: '061', status: 'available' }]);
});

test('getAdminDispatchStatusCopy 映射 admin 调度状态文案', () => {
  assert.equal(getAdminDispatchStatusCopy('awaiting_courier'), '待骑手接单');
  assert.equal(getAdminDispatchStatusCopy('delivering'), '配送中');
  assert.equal(getAdminDispatchStatusCopy('completed'), '已完成');
  assert.equal(getAdminDispatchStatusCopy('cancelled'), '已取消');
  assert.equal(getAdminDispatchStatusCopy('confirmed'), '已接单');
  assert.equal(getAdminDispatchStatusCopy('pending'), '待处理');
});

test('getReminderBadgeCopy 正确格式化提醒次数', () => {
  assert.equal(getReminderBadgeCopy(0), '已提醒 0 次');
  assert.equal(getReminderBadgeCopy(2), '已提醒 2 次');
});

test('shouldEscalateUnclaimedOrder 按时间阈值判断二次提醒', () => {
  assert.equal(
    shouldEscalateUnclaimedOrder(
      {
        status: 'awaiting_courier',
        riderBroadcastedAt: '2026-03-29T10:00:00.000Z',
        riderLastRemindedAt: '',
      },
      '2026-03-29T10:06:00.000Z',
      5,
    ),
    true,
  );

  assert.equal(
    shouldEscalateUnclaimedOrder(
      {
        status: 'awaiting_courier',
        riderBroadcastedAt: '2026-03-29T10:00:00.000Z',
        riderLastRemindedAt: '2026-03-29T10:04:00.000Z',
      },
      '2026-03-29T10:06:00.000Z',
      5,
    ),
    false,
  );

  assert.equal(
    shouldEscalateUnclaimedOrder(
      {
        status: 'pending',
        riderBroadcastedAt: '2026-03-29T10:00:00.000Z',
      },
      '2026-03-29T10:06:00.000Z',
      5,
    ),
    false,
  );
});

test('buildDispatchPublishPayload stores awaiting_courier state and eta metadata', () => {
  const payload = buildDispatchPublishPayload(15, '2026-03-29T10:00:00.000Z');
  assert.deepEqual(payload, {
    status: 'awaiting_courier',
    pickupEtaMinutes: 15,
    pickupReadyAt: '2026-03-29T10:15:00.000Z',
    riderBroadcastedAt: '2026-03-29T10:00:00.000Z',
    riderRemindCount: 0,
    riderLastRemindedAt: '',
  });
});

test('filterRiderActiveOrders 仅返回 awaiting_courier 和当前骑手 delivering', () => {
  const allOrders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '', createdAt: '2026-04-03T20:00:00.000Z' },
    { id: 2, status: 'delivering', courier_phone: '06111' },
    { id: 3, status: 'delivering', courier_phone: '06222' },
    { id: 4, status: 'completed', courier_phone: '06111' },
    { id: 5, status: 'pending', courier_phone: '' },
  ];

  assert.deepEqual(filterRiderActiveOrders(allOrders, '06111', '2026-04-03T20:30:00.000Z').map((order) => order.id), [1, 2]);
});

test('filterRiderActiveOrders 在空手机号时仅返回 awaiting_courier', () => {
  const allOrders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '', createdAt: '2026-04-03T20:00:00.000Z' },
    { id: 2, status: 'delivering', courier_phone: '06111' },
    { id: 3, status: 'delivering', courier_phone: '06222' },
    { id: 4, status: 'completed', courier_phone: '06111' },
  ];

  assert.deepEqual(filterRiderActiveOrders(allOrders, '', '2026-04-03T20:30:00.000Z').map((order) => order.id), [1]);
  assert.deepEqual(filterRiderActiveOrders(allOrders, '   ', '2026-04-03T20:30:00.000Z').map((order) => order.id), [1]);
});


test('filterRiderActiveOrders 过滤过期 awaiting_courier 旧单', () => {
  const allOrders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '', createdAt: '2026-04-03T20:25:00.000Z' },
    { id: 2, status: 'awaiting_courier', courier_phone: '', createdAt: '2026-03-30T20:25:00.000Z' },
    { id: 3, status: 'delivering', courier_phone: '06111', createdAt: '2026-03-30T20:25:00.000Z' },
  ];

  assert.deepEqual(filterRiderActiveOrders(allOrders, '06111', '2026-04-03T20:30:00.000Z').map((order) => order.id), [1, 3]);
});

test('buildContactableRiderRows 仅保留可联系的 available 骑手', () => {
  assert.deepEqual(
    buildContactableRiderRows([
      { id: 1, name: 'A', phone: '061', status: 'available' as const },
      { id: 2, name: 'B', phone: '', status: 'available' as const },
      { id: 3, name: 'C', phone: '062', status: 'busy' as const },
    ]),
    [{ id: 1, name: 'A', phone: '061', status: 'available' }],
  );
});

test('readDispatchMetaFromRemarks 读取最近一条派单反馈和拒单骑手列表', () => {
  const remarksJson = JSON.stringify([
    '普通备注',
    'dispatch_meta:{"lastRiderDecision":{"action":"declined","riderId":"7","riderName":"骑手A","riderPhone":"061","at":"2026-04-06T12:03:00.000Z"},"declinedRiderIds":["7","8"]}',
  ]);

  assert.deepEqual(
    readDispatchMetaFromRemarks(remarksJson),
    {
      lastRiderDecision: {
        action: 'declined',
        riderId: '7',
        riderName: '骑手A',
        riderPhone: '061',
        at: '2026-04-06T12:03:00.000Z',
      },
      declinedRiderIds: ['7', '8'],
    },
  );
});

test('filterAvailableRidersForOrder 排除当前订单已拒单骑手', () => {
  const riders = [
    { id: 7, name: '骑手A', phone: '061', status: 'available' as const },
    { id: 8, name: '骑手B', phone: '062', status: 'available' as const },
    { id: 9, name: '骑手C', phone: '063', status: 'busy' as const },
  ];
  const remarksJson = JSON.stringify([
    'dispatch_meta:{"declinedRiderIds":["8"]}',
  ]);

  assert.deepEqual(
    filterAvailableRidersForOrder(riders, remarksJson),
    [{ id: 7, name: '骑手A', phone: '061', status: 'available' }],
  );
});

test('filterRiderDashboardOrders returns active orders for active view', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '' },
    { id: 2, status: 'delivering', courier_phone: '123' },
    { id: 3, status: 'completed', courier_phone: '123' },
  ];
  assert.deepEqual(filterRiderDashboardOrders(orders, '123', 'active').map((o) => o.id), [1, 2]);
});

test('filterRiderDashboardOrders returns completed orders for history view', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '' },
    { id: 2, status: 'delivering', courier_phone: '123' },
    { id: 3, status: 'completed', courier_phone: '123' },
  ];
  assert.deepEqual(filterRiderDashboardOrders(orders, '123', 'history').map((o) => o.id), [3]);
});

test('getRiderStatusHintCopy explains available status', () => {
  assert.equal(getRiderStatusHintCopy('available'), '当前会进入派单名单并显示可抢订单');
  assert.equal(getRiderStatusHintCopy('busy'), '当前不会收到新派单，但可继续处理已接订单');
  assert.equal(getRiderStatusHintCopy('offline'), '当前不会进入派单名单');
});

test('buildReminderPayload 递增提醒次数并更新时间戳', () => {
  const order = { riderRemindCount: 1 };
  const payload = buildReminderPayload(order, '2026-03-29T10:00:00.000Z');
  assert.deepEqual(payload, {
    riderRemindCount: 2,
    riderLastRemindedAt: '2026-03-29T10:00:00.000Z',
  });
});

test('history view only keeps completed rider orders', () => {
  const orders = [
    { id: 1, status: 'completed', courier_phone: '0613083899' },
    { id: 2, status: 'completed', courier_phone: '0600' },
    { id: 3, status: 'delivering', courier_phone: '0613083899' },
  ];
  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0613083899', 'history').map((item) => item.id),
    [1],
  );
});

test('filterRiderDashboardOrders 在 history 视图且 riderPhone 为空时返回空数组', () => {
  const orders = [{ id: 1, status: 'completed', courier_phone: '123' }];
  assert.deepEqual(filterRiderDashboardOrders(orders, '', 'history'), []);
});

test('filterRiderDashboardOrders 兼容 canonical courierPhone 字段', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courierPhone: '' },
    { id: 2, status: 'delivering', courierPhone: '123' },
    { id: 3, status: 'completed', courierPhone: '123' },
  ];
  assert.deepEqual(filterRiderDashboardOrders(orders, '123', 'active').map((o) => o.id), [1, 2]);
  assert.deepEqual(filterRiderDashboardOrders(orders, '123', 'history').map((o) => o.id), [3]);
});
