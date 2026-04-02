import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/ReservationModal.tsx');

test('ReservationModal source uses canonical preorder and reservation payload fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /subName\?: string;/);
  assert.match(source, /isAvailable\?: number;/);
  assert.match(source, /productId: string \| number;/);
  assert.match(source, /subName: string;/);
  assert.match(source, /\{ id: item\.productId, price: Number\(item\.price \|\| 0\) \}/);
  assert.match(source, /productId: item\.id,/);
  assert.match(source, /subName: item\.subName \|\| "",/);
  assert.match(source, /productId: item\.productId,/);
  assert.match(source, /subName: item\.subName,/);
  assert.match(source, /\.filter\(\(p\) => Number\(p\?\.isAvailable \?\? 1\) !== 0\)/);
  assert.match(source, /subName: String\(p\.subName \|\| ""\),/);
  assert.match(source, /subName: String\(cat\?\.subName \|\| ""\),/);
  assert.match(source, /const text = `\$\{p\.name\} \$\{p\.subName \|\| ""\}`\.toLowerCase\(\);/);
  assert.match(source, /productId: product\.id,/);
  assert.match(source, /subName: String\(product\.subName \|\| ""\),/);
  assert.match(source, /\{p\.subName \|\| "-"\}/);
  assert.match(source, /guestCount: guestCount,/);
  assert.match(source, /reservationTime: reservationDateTime,/);
  assert.match(source, /customerPhone: customerPhone,/);
  assert.match(source, /dineType: "dine_in",/);
  assert.match(source, /deliveryAddress: null,/);
  assert.match(source, /customerName: customerName \|\| null,/);
  assert.match(source, /reservationId: data\?\.reservationId \|\| null,/);
  assert.match(source, /createdAt: new Date\(\)\.toISOString\(\),/);
  assert.match(source, /const reservationId = data\?\.reservationId \? `\\n预订号 \/ ID: \$\{data\.reservationId\}` : "";/);

  assert.doesNotMatch(source, /sub_name/);
  assert.doesNotMatch(source, /product_id/);
  assert.doesNotMatch(source, /is_available/);
  assert.doesNotMatch(source, /guest_count/);
  assert.doesNotMatch(source, /reservation_time/);
  assert.doesNotMatch(source, /customer_phone/);
  assert.doesNotMatch(source, /dine_type/);
  assert.doesNotMatch(source, /delivery_address/);
  assert.doesNotMatch(source, /customer_name/);
  assert.doesNotMatch(source, /reservation_id/);
  assert.doesNotMatch(source, /created_at/);
});
