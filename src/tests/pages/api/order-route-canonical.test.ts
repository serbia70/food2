import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/order.ts');

test('api order route source uses canonical request and response fields', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /scheduledFor\?: string;/);
  assert.match(source, /orderId\?: number;/);
  assert.match(source, /orderNo\?: string;/);
  assert.match(source, /const dineInAction = String\(raw\?\.dineInAction \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(source, /table_info: String\(raw\?\.info \|\| ''\),/);
  assert.match(source, /order_type: isDineIn \? 'dine_in' : 'delivery',/);
  assert.doesNotMatch(source, /tableInfo: String\(raw\?\.info \|\| ''\),/);
  assert.doesNotMatch(source, /orderType: isDineIn \? 'dine_in' : 'delivery',/);
  assert.match(source, /total_amount: Number\(raw\?\.total \|\| 0\),/);
  assert.match(source, /user_phone: String\(raw\?\.user\?\.phone \|\| ''\),/);
  assert.match(source, /scheduled_for: !isDineIn && String\(raw\?\.scheduledFor \|\| ''\)\.trim\(\) \? String\(raw\?\.scheduledFor \|\| ''\)\.trim\(\) : '',/);
  assert.match(source, /dine_in_action: isDineIn \? dineInAction : '',/);
  assert.match(source, /orderId: data\.orderId,/);
  assert.match(source, /orderNo: data\.orderNo,/);

  assert.doesNotMatch(source, /tableInfo: String\(raw\?\.info \|\| ''\),/);
  assert.doesNotMatch(source, /orderType: isDineIn \? 'dine_in' : 'delivery',/);
  assert.doesNotMatch(source, /totalAmount: Number\(raw\?\.total \|\| 0\),/);
  assert.doesNotMatch(source, /userPhone: String\(raw\?\.user\?\.phone \|\| ''\),/);
  assert.doesNotMatch(source, /scheduledFor: !isDineIn && String\(raw\?\.scheduledFor \|\| ''\)\.trim\(\) \? String\(raw\?\.scheduledFor \|\| ''\)\.trim\(\) : '',/);
  assert.doesNotMatch(source, /dineInAction: isDineIn \? dineInAction : '',/);
  assert.doesNotMatch(source, /order_id/);
  assert.doesNotMatch(source, /order_no/);
});
