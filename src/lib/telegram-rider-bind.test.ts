import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRiderTelegramBindToken,
  parseRiderTelegramBindToken,
} from './telegram-rider-bind.ts';

test('build + parse rider telegram bind token round-trips', () => {
  const token = buildRiderTelegramBindToken(
    { riderId: 7, riderPhone: '0613083899', expiresAt: '2026-03-30T10:05:00.000Z' },
    'secret',
  );
  assert.deepEqual(parseRiderTelegramBindToken(token, 'secret'), {
    riderId: 7,
    riderPhone: '0613083899',
    expiresAt: '2026-03-30T10:05:00.000Z',
  });
});

test('parse throws on invalid signature', () => {
  assert.throws(() => parseRiderTelegramBindToken('bad.token', 'secret'), /invalid_bind_signature/);
});

test('build throws on invalid rider id', () => {
  assert.throws(() => buildRiderTelegramBindToken(
    { riderId: 0, riderPhone: '0613083899', expiresAt: '2026-03-30T10:05:00.000Z' },
    'secret',
  ), /invalid_bind_rider_id/);
});

test('build throws on empty rider phone', () => {
  assert.throws(() => buildRiderTelegramBindToken(
    { riderId: 7, riderPhone: '', expiresAt: '2026-03-30T10:05:00.000Z' },
    'secret',
  ), /invalid_bind_rider_phone/);
});

test('build throws on invalid expiresAt', () => {
  assert.throws(() => buildRiderTelegramBindToken(
    { riderId: 7, riderPhone: '0613083899', expiresAt: 'not-a-date' },
    'secret',
  ), /invalid_bind_expires_at/);
});
