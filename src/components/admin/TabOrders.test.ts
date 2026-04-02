import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/admin/TabOrders.astro');

test('TabOrders source uses canonical order dispatch fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /JSON\.parse\(o\.itemsJson \|\| '\{\}'\)/);
  assert.match(source, /#\{o\.orderNo \|\| o\.id\}/);
  assert.match(source, /String\(o\.orderNo \|\| o\.id\)\.slice\(-3\)/);
  assert.match(source, /formatBelgradeHHmm\(o\.createdAt\)/);
  assert.match(source, /o\.userPhone/);
  assert.match(source, /data-phone=\{o\.userPhone\}/);
  assert.match(source, /formatTableLabel\(o\.tableInfo\)/);
  assert.match(source, /o\.totalAmount\} RSD/);
  assert.match(source, /data-order-no=\{o\.orderNo\}/);
  assert.match(source, /data-items=\{o\.itemsJson\}/);
  assert.match(source, /data-remarks=\{o\.remarksJson\}/);
  assert.match(source, /data-total=\{o\.totalAmount\}/);
  assert.match(source, /data-table=\{o\.tableInfo\}/);
  assert.match(source, /formatPickupEtaLabel\(o\.pickupEtaMinutes\)/);
  assert.match(source, /formatScheduledLabel\(o\.scheduledFor\)/);

  assert.doesNotMatch(source, /data-admin-action="remind-riders"/);
  assert.doesNotMatch(source, /data-admin-action="contact-riders"/);
  assert.doesNotMatch(source, /items_json/);
  assert.doesNotMatch(source, /rider_remind_count/);
  assert.doesNotMatch(source, /order_no/);
  assert.doesNotMatch(source, /created_at/);
  assert.doesNotMatch(source, /user_phone/);
  assert.doesNotMatch(source, /table_info/);
  assert.doesNotMatch(source, /total_amount/);
  assert.doesNotMatch(source, /remarks_json/);
  assert.doesNotMatch(source, /pickup_eta_minutes/);
  assert.doesNotMatch(source, /scheduled_for/);
});
