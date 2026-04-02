import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/cart-modal/useCartOrderSubmit.ts');

test('useCartOrderSubmit source uses canonical cart item and order payload fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /productId\?: string \| number;/);
  assert.match(source, /subName\?: string;/);
  assert.match(source, /id: nextItem\.id \?\? nextItem\.productId \?\? ''/);
  assert.match(source, /productId: nextItem\.productId \?\? nextItem\.id \?\? '',/);
  assert.match(source, /subName: nextItem\.subName,/);
  assert.match(source, /scheduledFor: type === "delivery" && deliveryTimeMode === "scheduled" \? reservationTime : "",/);

  assert.doesNotMatch(source, /product_id/);
  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /scheduled_for/);
});
