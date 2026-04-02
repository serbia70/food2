import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/ShopChatModal.tsx');

test('ShopChatModal source uses canonical chat and order fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /\.filter\(\(o\) => String\(o\?\.orderType \|\| ''\)\.toLowerCase\(\) === 'delivery'\)/);
  assert.match(source, /\.filter\(\(o\) => Number\(o\?\.shopId \|\| o\?\.restaurantId \|\| 0\) === sid\)/);
  assert.match(source, /return \[\.\.\.list\]\.sort\(\(a, b\) => String\(b\?\.createdAt \|\| ''\)\.localeCompare\(String\(a\?\.createdAt \|\| ''\)\)\)\[0\] \|\| null;/);
  assert.match(source, /if \(!payload \|\| Number\(payload\.shopId \|\| 0\) !== Number\(chatContext\.shopId\)\) return;/);
  assert.match(source, /msg\.senderRole === 'user'/);
  assert.match(source, /msg\.createdAt \? new Date\(msg\.createdAt\)\.toLocaleString\('sr-RS'/);
  assert.match(source, /body: JSON\.stringify\(\{ shopId: chatContext\.shopId, senderPhone: chatContext\.userPhone, message \}\)/);
  assert.match(source, /\{lastReservation\?\.reservationTime \? \(/);
  assert.match(source, /String\(lastReservation\.reservationTime \|\| ''\)/);
  assert.match(source, /Number\(lastReservation\.guestCount \|\| 0\) \|\| '-'/);

  assert.doesNotMatch(source, /o\?\.order_type/);
  assert.doesNotMatch(source, /o\?\.shop_id/);
  assert.doesNotMatch(source, /o\?\.restaurant_id/);
  assert.doesNotMatch(source, /lastReservation\?\.reservation_time/);
  assert.doesNotMatch(source, /lastReservation\.guest_count/);
  assert.doesNotMatch(source, /payload\.shop_id/);
  assert.doesNotMatch(source, /msg\.sender_role/);
  assert.doesNotMatch(source, /shop_id: chatContext\.shopId/);
  assert.doesNotMatch(source, /sender_phone: chatContext\.userPhone/);
});
