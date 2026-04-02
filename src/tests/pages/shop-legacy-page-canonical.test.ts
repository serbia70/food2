import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/shop.astro');

test('legacy shop page source uses canonical menu and order fields', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /sub\.textContent = String\(product\.subName \|\| ''\);/);
  assert.match(page, /productId: p\.id,/);
  assert.match(page, /tableInfo: tableInfo,/);
  assert.match(page, /orderType: 'dine_in',/);
  assert.match(page, /totalAmount: getTotal\(\),/);
  assert.match(page, /userPhone: phone/);
  assert.match(page, /alert\('下单成功！订单号: ' \+ result\.orderNo\);/);

  assert.doesNotMatch(page, /product\.sub_name/);
  assert.doesNotMatch(page, /product_id/);
  assert.doesNotMatch(page, /table_info/);
  assert.doesNotMatch(page, /order_type/);
  assert.doesNotMatch(page, /total_amount/);
  assert.doesNotMatch(page, /user_phone/);
  assert.doesNotMatch(page, /result\.order_no/);
});
