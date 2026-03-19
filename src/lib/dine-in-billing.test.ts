import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDineInBillingState, getNextDineInBillingStart } from './dine-in-billing.ts';

test('next billing start always lands on the next month 1st', () => {
  assert.equal(getNextDineInBillingStart('2027-02-15'), '2027-03-01');
  assert.equal(getNextDineInBillingStart('2027-01-01'), '2027-02-01');
  assert.equal(getNextDineInBillingStart('2027-12-31'), '2028-01-01');
});

test('warning starts when remaining days are <= 5', () => {
  const state = buildDineInBillingState(
    {
      enable_dine_in: 1,
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-02-24',
  );

  assert.equal(state.alertLevel, 'warning');
  assert.equal(state.statusLabel, '即将到期');
});

test('red state lasts through grace day and auto-closes the next day', () => {
  const overdue = buildDineInBillingState(
    {
      enable_dine_in: 1,
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-03-06',
  );

  const autoClosed = buildDineInBillingState(
    {
      enable_dine_in: 1,
      dine_in_expires_at: '2027-03-01',
      dine_in_grace_until: '2027-03-06',
    },
    '2027-03-07',
  );

  assert.equal(overdue.alertLevel, 'overdue');
  assert.equal(autoClosed.alertLevel, 'auto_closed');
  assert.equal(autoClosed.statusLabel, '已自动关闭');
});

test('manual stop overrides date reminders', () => {
  const state = buildDineInBillingState(
    {
      enable_dine_in: 0,
      dine_in_stop_reason: 'manual',
      dine_in_expires_at: '2027-03-01',
    },
    '2027-02-24',
  );

  assert.equal(state.alertLevel, 'stopped');
  assert.equal(state.statusLabel, '已停用');
});

test('legacy expire_date still works as fallback', () => {
  const state = buildDineInBillingState(
    {
      enable_dine_in: 1,
      expire_date: '2027-03-01',
    },
    '2027-02-24',
  );

  assert.equal(state.statusLabel, '即将到期');
  assert.equal(state.expiresAt, '2027-03-01');
});
