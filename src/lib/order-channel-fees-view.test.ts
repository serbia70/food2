import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderChannelFeePlan, formatOrderChannelFeeRule } from './order-channel-fees-view.ts';

test('new fields override legacy fields and 0 stays free', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'reservation',
    enabled: 1,
    commissionType: 'percentage',
    commissionValue: 0,
    legacyEnabled: 0,
    legacyCommissionType: 'per_order',
    legacyCommissionValue: 18,
  });

  assert.equal(plan.channel, 'reservation');
  assert.equal(plan.enabled, true);
  assert.equal(plan.commissionType, 'percentage');
  assert.equal(plan.commissionValue, 0);
  assert.equal(plan.isFree, true);
  assert.equal(plan.displayText, '免费');
  assert.equal(plan.source, 'new');
  assert.equal(plan.sourceLabel, '店铺覆盖');
});

test('new fields can still reuse legacy enabled when explicit enabled is missing', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'reservation',
    commissionType: 'percentage',
    commissionValue: 0,
    legacyEnabled: 0,
    legacyCommissionType: 'per_order',
    legacyCommissionValue: 18,
  });

  assert.equal(plan.enabled, false);
  assert.equal(plan.commissionType, 'percentage');
  assert.equal(plan.commissionValue, 0);
  assert.equal(plan.isFree, true);
  assert.equal(plan.displayText, '免费');
  assert.equal(plan.source, 'new');
  assert.equal(plan.sourceLabel, '店铺覆盖');
});

test('legacy fields still resolve when new fields are missing', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'delivery',
    legacyEnabled: 1,
    legacyCommissionType: 'per_order',
    legacyCommissionValue: 35,
    defaultEnabled: false,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 3,
  });

  assert.equal(plan.channel, 'delivery');
  assert.equal(plan.enabled, true);
  assert.equal(plan.commissionType, 'per_order');
  assert.equal(plan.commissionValue, 35);
  assert.equal(plan.isFree, false);
  assert.equal(plan.displayText, '每单 35 RSD');
  assert.equal(plan.source, 'legacy');
  assert.equal(plan.sourceLabel, '店铺覆盖');
});

test('legacy values matching defaults should be treated as defaults', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'reservation',
    legacyEnabled: 0,
    legacyCommissionType: 'per_order',
    legacyCommissionValue: 30,
    defaultEnabled: true,
    defaultCommissionType: 'per_order',
    defaultCommissionValue: 30,
  });

  assert.equal(plan.enabled, false);
  assert.equal(plan.commissionType, 'per_order');
  assert.equal(plan.commissionValue, 30);
  assert.equal(plan.displayText, '每单 30 RSD');
  assert.equal(plan.source, 'default');
  assert.equal(plan.sourceLabel, '全局默认');
});

test('defaults are used when no override exists', () => {
  const plan = buildOrderChannelFeePlan({
    channel: 'delivery',
    defaultEnabled: true,
    defaultCommissionType: 'percentage',
    defaultCommissionValue: 3,
  });

  assert.equal(plan.channel, 'delivery');
  assert.equal(plan.enabled, true);
  assert.equal(plan.commissionType, 'percentage');
  assert.equal(plan.commissionValue, 3);
  assert.equal(plan.isFree, false);
  assert.equal(plan.displayText, '3%');
  assert.equal(plan.source, 'default');
  assert.equal(plan.sourceLabel, '全局默认');
});

test('percentage and per_order still format correctly', () => {
  assert.equal(formatOrderChannelFeeRule('percentage', 3), '3%');
  assert.equal(formatOrderChannelFeeRule('per_order', 35), '每单 35 RSD');
});
