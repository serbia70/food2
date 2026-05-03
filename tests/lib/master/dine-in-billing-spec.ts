import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDineInBillingState, getNextDineInBillingStart } from '../../../src/lib/dine-in-billing.ts';

test('getNextDineInBillingStart 按 Belgrade 月初推进', () => {
  assert.equal(getNextDineInBillingStart('2026-04-26'), '2026-05-01');
  assert.equal(getNextDineInBillingStart('2026-12-15'), '2027-01-01');
});

test('buildDineInBillingState 对正常 / warning / overdue / auto_closed / stopped 给出稳定 alertLevel', () => {
  assert.equal(buildDineInBillingState({
    dine_in_billing_start_at: '2026-01-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-04-20').alertLevel, 'normal');

  assert.equal(buildDineInBillingState({
    dine_in_billing_start_at: '2026-01-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-04-27').alertLevel, 'warning');

  assert.equal(buildDineInBillingState({
    dine_in_billing_start_at: '2026-01-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-04-30').alertLevel, 'overdue');

  assert.equal(buildDineInBillingState({
    dine_in_billing_start_at: '2026-01-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-05-06').alertLevel, 'auto_closed');

  const stopped = buildDineInBillingState({
    enable_dine_in: 0,
    dine_in_stop_reason: 'manual',
    dine_in_billing_start_at: '2026-01-01',
    dine_in_expires_at: '2026-04-30',
  }, '2026-04-20');
  assert.equal(stopped.alertLevel, 'stopped');
  assert.equal(stopped.statusLabel, '已停用');
});

test('buildDineInBillingState 在缺少显式字段时回退 graceUntil 与默认 start', () => {
  const state = buildDineInBillingState({}, '2026-04-26');
  assert.equal(state.billingStartAt, '2026-05-01');
  assert.equal(state.expiresAt, '2027-05-01');
  assert.equal(state.graceUntil, '2027-05-06');
});
