import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/api/telegram/rider-claim.ts');

test('telegram rider claim source only uses camelCase order fields', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /return String\(rider\.telegramChatId \|\| ''\)\.trim\(\);/);
  assert.match(source, /orderNo: String\(order\.orderNo \|\| callback\.orderId \|\| ''\)\.trim\(\),/);
  assert.match(source, /address: String\(order\.tableInfo \|\| ''\)\.trim\(\) \|\| '未提供地址',/);
  assert.match(source, /phone: String\(order\.userPhone \|\| ''\)\.trim\(\) \|\| '-',/);
  assert.match(source, /totalAmount: Number\(order\.totalAmount \|\| 0\) \|\| 0,/);
  assert.match(source, /pickupEtaMinutes: Number\(order\.pickupEtaMinutes \|\| 0\) \|\| 0,/);
  assert.match(source, /remarksJson: String\(\(matched as Record<string, unknown>\)\.remarksJson \|\| ''\)\.trim\(\),/);
  assert.match(source, /expectedCurrentStatus: 'awaiting_courier',/);
  assert.match(source, /expectedCurrentStatus: 'delivering',/);
  assert.match(source, /expectedCurrentStatus: 'picked_up',/);
  assert.match(source, /remarksJson: JSON\.stringify\(nextRemarks\),/);

  assert.doesNotMatch(source, /telegram_chat_id/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /pickup_eta_minutes/);
  assert.doesNotMatch(source, /remarks_json/);
  assert.doesNotMatch(source, /expected_current_status/);
  assert.doesNotMatch(source, /courier_name/);
  assert.doesNotMatch(source, /courier_phone/);
});
