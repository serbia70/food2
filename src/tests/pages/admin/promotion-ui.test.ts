import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const marketingPath = resolve(process.cwd(), 'src/components/admin/TabMarketing.astro');

test('promotion modal source widens layout and exposes special search regions', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.doesNotMatch(file, /max-width:\s*500px/);
  assert.match(file, /width:\s*min\(900px,\s*calc\(100vw\s*-\s*48px\)\)/);
  assert.match(file, /id="promo-product-search"/);
  assert.match(file, /id="promo-selected-products"/);
  assert.match(file, /id="promo-available-products"/);
});

test('promotion special selector source supports bilingual names and selected-state rendering', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /displayNameSecondary/);
  assert.match(file, /renderSelectedProducts/);
  assert.match(file, /renderAvailableProducts/);
  assert.match(file, /specialSelectionState\.includes\(nextId\)/);
  assert.doesNotMatch(file, /sub_name/);
});

test('promotion edit and search source preserve selection state', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /setPromotionProductSearch\(/);
  assert.match(file, /hydrateSpecialSelection\(/);
  assert.match(file, /searchTerm/);
  assert.match(file, /filter\(\(p\) => \{/);
  assert.match(file, /specialSelectionState\s*=\s*Array\.isArray\(selectedIds\)\s*\?\s*\[\.\.\.selectedIds\]\s*:\s*\[\]/);
});

test('promotion product normalization source derives bilingual display fields', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /displayNamePrimary:\s*String\(p\.name\s*\|\|\s*''\)/);
  assert.match(file, /displayNameSecondary:\s*String\(p\.subName\s*\|\|\s*''\)/);
  assert.match(file, /price:\s*Number\(p\.price\s*\|\|\s*0\)/);
  assert.doesNotMatch(file, /p\.sub_name/);
});

test('promotion special selector source filters available products and supports add remove actions', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /function addSpecialProduct\(productId\)/);
  assert.match(file, /function removeSpecialProduct\(productId\)/);
  assert.match(file, /const selectedProductIds = specialSelectionState/);
  assert.doesNotMatch(file, /let selectedProductIds = \[\];/);
  assert.match(file, /!selectedProductIds\.includes\(p\.id\)/);
  assert.match(file, /primaryText\.includes\(searchTerm\)/);
  assert.match(file, /secondaryText\.includes\(searchTerm\)/);
});

test('promotion modal source resets and hydrates special state for create and edit', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /function resetSpecialSelectionState\(\)/);
  assert.match(file, /resetSpecialSelectionState\(\);[\s\S]*loadProducts\(\);/);
  assert.match(file, /hydrateSpecialSelection\(parsePromotionProductIds\(p\.selectedProducts\)\);/);
  assert.match(file, /setPromotionProductSearch\(''\);/);
  assert.match(file, /if \(type === 'special'\) \{[\s\S]*syncSpecialProductUI\(\);[\s\S]*\}/);
  assert.doesNotMatch(file, /selected_products/);
});

test('promotion type source keeps only spend_discount and special fields', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /<option value="spend_discount">/);
  assert.match(file, /<option value="special">/);
  assert.doesNotMatch(file, /<option value="percent_discount">/);
  assert.doesNotMatch(file, /<option value="bonus_points">/);
  assert.doesNotMatch(file, /id="promo-points-fields"/);
  assert.doesNotMatch(file, /id="promotion-bonus-points"/);
});

test('promotion and customer loaders preserve response status before rendering data', async () => {
  const marketingFile = await readFile(marketingPath, 'utf8');
  const customersPath = resolve(process.cwd(), 'src/components/admin/TabCustomers.astro');
  const customersFile = await readFile(customersPath, 'utf8');

  assert.match(marketingFile, /async function fetchJSONWithRetry\(url, init\)/);
  assert.match(marketingFile, /const res = await fetch\(url, init\);/);
  assert.match(marketingFile, /const data = await res\.json\(\);/);
  assert.match(marketingFile, /return \{ res, data \};/);
  assert.match(marketingFile, /const \{ res, data \} = await fetchJSONWithRetry\('\/api\/admin\/promotions'\);/);
  assert.match(marketingFile, /const \{ res, data \} = await fetchJSONWithRetry\(`\/\$\{encodeURIComponent\(shopSlug\)\}\/menu`\);/);
  assert.match(marketingFile, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.match(marketingFile, /if \(!res\.ok \|\| !data\.success\)/);
  assert.match(marketingFile, /const menuCategories = Array\.isArray\(data\) \? data : Array\.isArray\(data\?\.items\) \? data\.items : Array\.isArray\(data\?\.data\) \? data\.data : \[\];/);
  assert.match(marketingFile, /if \(!res\.ok \|\| !menuCategories\.length\)/);
  assert.match(marketingFile, /renderInfo\(container, '加载促销失败'/);
  assert.match(marketingFile, /renderInfo\(container, '加载菜品失败'/);
  assert.doesNotMatch(marketingFile, /loadPromotions\(\);\s*loadProducts\(\);\s*<\/script>/);
  assert.doesNotMatch(marketingFile, /if \(tabName === 'marketing'\) \{[\s\S]*loadMarketingProducts\(\);[\s\S]*\}/);
  assert.match(customersFile, /async function fetchJSONWithRetry\(url, init\)/);
  assert.match(customersFile, /await fetchJSONWithRetry\('\/api\/admin\/customers'\)/);
});
