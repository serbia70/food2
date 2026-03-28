import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shopPagePath = new URL('./[slug]/index.astro', import.meta.url);

test('shop page normalizes promotions once and passes specialPromotionMap into menu and checkout surfaces', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /const promotionsData = Array\.isArray\(shop\?\.promotions\) \? shop\.promotions : \[\];/);
  assert.match(file, /const specialPromotionMap = normalizeSpecialPromotions\(promotionsData\);/);
  assert.match(file, /subName: cat\?\.sub_name \|\| cat\?\.subName \|\| ''/);
  assert.match(file, /subName: p\?\.sub_name \|\| p\?\.subName \|\| ''/);
  assert.match(file, /<MenuList[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?\/>/);
  assert.match(file, /<CartModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
  assert.match(file, /<UserModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
  assert.match(file, /<ReservationModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
});
