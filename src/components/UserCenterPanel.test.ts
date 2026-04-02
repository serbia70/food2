import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/UserCenterPanel.tsx');

test('UserCenterPanel source uses canonical user order fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /const addressSummary = String\(order\.tableInfo \|\| ''\)/);
  assert.match(source, /const items = typeof order\.itemsJson === 'string' \? JSON\.parse\(order\.itemsJson\) : order\.itemsJson;/);
  assert.match(source, /\{i\.subName\}/);
  assert.match(source, /<div key=\{`\$\{order\.orderNo \|\| idx\}`\} className=\{`history-order-card \$\{statusClass\}`\}>/);
  assert.match(source, /Number\(order\.totalAmount \|\| 0\)\.toLocaleString\(\)\} RSD/);
  assert.match(source, /#\{order\.orderNo\}/);
  assert.match(source, /String\(order\.orderNo \|\| ''\)\.slice\(-3\)/);
  assert.match(source, /new Date\(order\.createdAt \|\| ''\)\.toLocaleString\('sr-RS'/);
  assert.match(source, /const items = typeof order\?\.itemsJson === 'string' \? JSON\.parse\(order\.itemsJson\) : order\?\.itemsJson;/);
  assert.match(source, /const sub = String\(i\?\.subName \|\| ''\)\.trim\(\);/);
  assert.match(source, /const pickupNo = String\(order\?\.orderNo \|\| order\?\.id \|\| ''\)\.slice\(-3\);/);
  assert.match(source, /const timeText = order\?\.createdAt/);
  assert.match(source, /const addressSummary = String\(order\?\.tableInfo \|\| ''\)/);
  assert.match(source, /<article key=\{`\$\{order\?\.orderNo \|\| idx\}`\} className=\{`order-card \$\{statusClass\}`\}>/);
  assert.match(source, /#\{order\?\.orderNo \|\| order\?\.id \|\| '-'\}/);
  assert.match(source, /Number\(order\?\.totalAmount \|\| 0\)\.toLocaleString\(\)\} RSD/);
  assert.match(source, /if \(targetOrder\?\.shopId\) \{/);
  assert.match(source, /setChatShopId\(Number\(targetOrder\.shopId\)\);/);
  assert.match(source, /if \(!payload \|\| Number\(payload\.shopId \|\| 0\) !== Number\(chatContext\.shopId\)\) return;/);
  assert.match(source, /msg\.senderRole === 'user'/);
  assert.match(source, /msg\.createdAt \? new Date\(msg\.createdAt\)\.toLocaleString\('sr-RS'/);
  assert.match(source, /body: JSON\.stringify\(\{ shopId: chatContext\.shopId, senderPhone: chatContext\.userPhone, message \}\)/);

  assert.doesNotMatch(source, /order\.table_info/);
  assert.doesNotMatch(source, /order\.items_json/);
  assert.doesNotMatch(source, /i\.sub_name/);
  assert.doesNotMatch(source, /order\.order_no/);
  assert.doesNotMatch(source, /order\.total_amount/);
  assert.doesNotMatch(source, /order\.created_at/);
  assert.doesNotMatch(source, /targetOrder\.shop_id/);
  assert.doesNotMatch(source, /payload\.shop_id/);
  assert.doesNotMatch(source, /msg\.sender_role/);
  assert.doesNotMatch(source, /msg\.created_at/);
  assert.doesNotMatch(source, /shop_id: chatContext\.shopId/);
  assert.doesNotMatch(source, /sender_phone: chatContext\.userPhone/);
});
