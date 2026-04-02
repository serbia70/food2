import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeRiderSession, isValidRiderSession, getRiderTelegramBindingCopy } from './rider-session.ts';

test('normalizeRiderSession keeps required rider fields', () => {
  const input = {
    id: 1,
    name: 'Test Rider',
    phone: '1234567890',
    status: 'available',
    telegramChatId: '123',
    extra: 'ignore me'
  };
  const result = normalizeRiderSession(input);
  assert.deepEqual(result, {
    id: 1,
    name: 'Test Rider',
    phone: '1234567890',
    status: 'available',
    telegramChatId: '123'
  });
});

test('normalizeRiderSession handles invalid status', () => {
  const input = {
    id: 1,
    name: 'Test',
    phone: '123',
    status: 'invalid'
  };
  const result = normalizeRiderSession(input);
  assert.strictEqual(result.status, 'offline');
});

test('isValidRiderSession rejects missing phone', () => {
  const input = {
    id: 1,
    name: 'Test Rider',
    phone: '',
    status: 'available'
  };
  assert.strictEqual(isValidRiderSession(input), false);
});

test('isValidRiderSession handles invalid states', () => {
  assert.strictEqual(isValidRiderSession(null), false);
  assert.strictEqual(isValidRiderSession({}), false);
  assert.strictEqual(isValidRiderSession({ id: 1, name: 'T', phone: '1', status: 'invalid' }), false);
});

test('normalizeRiderSession trims fields', () => {
  const input = {
    id: 1,
    name: '  Name  ',
    phone: '  123  ',
    status: 'available',
    telegramChatId: '  chat  '
  };
  const result = normalizeRiderSession(input);
  assert.strictEqual(result.name, 'Name');
  assert.strictEqual(result.phone, '123');
  assert.strictEqual(result.telegramChatId, 'chat');
});

test('isValidRiderSession rejects invalid id', () => {
  assert.strictEqual(isValidRiderSession({ id: 0, name: 'A', phone: '1', status: 'available' }), false);
  assert.strictEqual(isValidRiderSession({ id: -1, name: 'A', phone: '1', status: 'available' }), false);
  assert.strictEqual(isValidRiderSession({ id: '1', name: 'A', phone: '1', status: 'available' }), false);
});

test('normalize and validate combo', () => {
  const input = { id: 0, name: '   ', phone: '  ', status: 'invalid' };
  const normalized = normalizeRiderSession(input);
  assert.strictEqual(isValidRiderSession(normalized), false);
});

test('getRiderTelegramBindingCopy handles binding states', () => {
  assert.strictEqual(getRiderTelegramBindingCopy({ telegramChatId: null }), '未绑定 Telegram，无法接收送餐通知');
  assert.strictEqual(getRiderTelegramBindingCopy({ telegramChatId: undefined }), '未绑定 Telegram，无法接收送餐通知');
  assert.strictEqual(getRiderTelegramBindingCopy({ telegramChatId: '' }), '未绑定 Telegram，无法接收送餐通知');
  assert.strictEqual(getRiderTelegramBindingCopy({ telegramChatId: '  ' }), '未绑定 Telegram，无法接收送餐通知');
  assert.strictEqual(getRiderTelegramBindingCopy({ telegramChatId: '123' }), '已绑定 Telegram，可接收送餐通知');
});
