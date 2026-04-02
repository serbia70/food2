import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shopPagePath = new URL('../../pages/[slug]/index.astro', import.meta.url);

test('shop page normalizes promotions once and passes specialPromotionMap into menu and checkout surfaces', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /const promotionsData = Array\.isArray\(shop\?\.promotions\) \? shop\.promotions : \[\];/);
  assert.match(file, /const specialPromotionMap = normalizeSpecialPromotions\(promotionsData\);/);
  assert.match(file, /subName: cat\?\.subName \|\| ''/);
  assert.match(file, /subName: p\?\.subName \|\| ''/);
  assert.doesNotMatch(file, /subName: cat\?\.sub_name \|\| cat\?\.subName \|\| ''/);
  assert.doesNotMatch(file, /subName: p\?\.sub_name \|\| p\?\.subName \|\| ''/);
  assert.match(file, /<CartModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
  assert.match(file, /<UserModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
  assert.match(file, /<ReservationModal[\s\S]*?specialPromotionMap=\{specialPromotionMap\}[\s\S]*?client:load/);
});

test('home page resolves city/address display with shared resolver instead of private fallbacks', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.match(file, /import \{ resolveShopDisplaySettings \} from ['"]\.\.\/lib\/shop-display-settings['"];?/);
  assert.match(file, /const resolvedDisplaySettings = resolveShopDisplaySettings\(shop, shopSettings, masterSettings\);/);
  assert.match(file, /city: resolvedDisplaySettings\.city,/);
  assert.match(file, /const address =/);
  assert.match(file, /String\(shop\.address \|\| ''\)\.trim\(\)/);
  assert.match(file, /String\(shopSettings\.address \|\| ''\)\.trim\(\)/);
  assert.match(file, /resolvedDisplaySettings\.city \? `\$\{resolvedDisplaySettings\.city\}` : ''/);
  assert.doesNotMatch(file, /const city = String\(shopSettings\.city \|\| currentCity \|\| 'Belgrade'\);/);
  assert.doesNotMatch(file, /\$\{zone\}, \$\{city\}/);
});

test('home page city filter no longer hardcodes Belgrade passthrough', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.doesNotMatch(file, /s\.city === currentCity \|\| s\.city === 'Belgrade'/);
});

test('home page keeps selected city only for UI state, not shop city classification', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.match(file, /const currentCity = url\.searchParams\.get\('city'\) \|\| '';/);
  assert.match(file, /const selectedCity = currentCity \|\| 'Belgrade';/);
  assert.match(file, /city: resolvedDisplaySettings\.city,/);
  assert.doesNotMatch(file, /city: resolvedDisplaySettings\.city \|\| selectedCity,/);
  assert.match(file, /<span>📍 \{selectedCity\}<\/span>/);
  assert.match(file, /if \(currentCity\) \{/);
  assert.match(file, /shopsArray = shopsArray\.filter\(\(s\) => s\.city === currentCity\);/);
});

test('home page normalizes menu preview image urls like shop page', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.match(file, /const normalizeMenuImageUrl = \(raw: any\): string => \{/);
  assert.match(file, /img\.startsWith\('\/uploads\/'\)/);
  assert.match(file, /img\.startsWith\('\/assets\/uploads\/'\)/);
  assert.match(file, /const menuCategories = Array\.isArray\(menu\?\.data\)\s*\?\s*menu\.data\s*:\s*Array\.isArray\(menu\)\s*\?\s*menu\s*:\s*\[\];/);
  assert.match(file, /\(menuCategories\)\.forEach\(\(cat: any\) => \{/);
  assert.match(file, /img: normalizeMenuImageUrl\(p\?\.img \|\| p\?\.imageUrl\) \|\| '\/favicon\.svg',/);
  assert.doesNotMatch(file, /flat\.slice\(0, 12\)/);
  assert.match(file, /products = flat\.map\(\(p\) => \(\{/);
});

test('home page shop card keeps screenshot-3 header and horizontal product strip structure', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.match(file, /<a href=\{`\/\$\{shop\.slug\}`} class="shop-card">[\s\S]*?<div class="shop-header">/);
  assert.match(file, /<div class="shop-name-wrap">[\s\S]*?<h4 class="shop-name">\{shop\.name\}<\/h4>[\s\S]*?<span class="status-badge">营业中<\/span>/);
  assert.match(file, /<div class="shop-delivery-info">起送 800 \| 配送 150 \| 满 1500 免<\/div>/);
  assert.match(file, /<div class="shop-row-2">[\s\S]*?<div class="shop-address">📍 \{shop\.address \|\| shop\.zone \|\| shop\.city\}<\/div>/);
  assert.match(file, /\{shop\.products && shop\.products\.length > 0 && \([\s\S]*?<div class="shop-products">/);
});

test('home page restores screenshot-3 compact flex strip with fixed thumbnails', async () => {
  const homePagePath = new URL('../../pages/index.astro', import.meta.url);
  const file = await readFile(homePagePath, 'utf8');

  assert.match(file, /<a href=\{`\/\$\{shop\.slug\}`} class="shop-card">[\s\S]*?<div class="shop-header">/);
  assert.match(file, /<div class="shop-products">[\s\S]*?\{shop\.products\.map\(\(p\) => \(/);
  assert.match(file, /\.shop-list \{[\s\S]*?padding: 0 10px;/);
  assert.match(file, /\.shop-card \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?border-radius: 12px;[\s\S]*?padding: 12px;/);
  assert.match(file, /\.shop-header \{[\s\S]*?display: flex;[\s\S]*?gap: 12px;/);
  assert.match(file, /\.shop-logo \{[\s\S]*?width: 60px;[\s\S]*?height: 60px;/);
  assert.match(file, /\.shop-products \{[\s\S]*?display: flex;[\s\S]*?gap: 10px;[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow-x: auto;[\s\S]*?padding: 12px 4px;[\s\S]*?margin-top: 8px;[\s\S]*?border-top: 1px solid #f5f5f5;/);
  assert.match(file, /\.prod-thumb \{[\s\S]*?width: 85px;[\s\S]*?flex-shrink: 0;/);
  assert.match(file, /\.prod-img-box \{[\s\S]*?width: 85px;[\s\S]*?height: 85px;[\s\S]*?border-radius: 8px;/);
  assert.match(file, /\.prod-name \{[\s\S]*?font-size: 11px;/);
  assert.match(file, /\.prod-price \{[\s\S]*?font-size: 12px;/);
  assert.doesNotMatch(file, /shop-products-track/);
  assert.doesNotMatch(file, /grid-auto-columns:/);
  assert.doesNotMatch(file, /aspect-ratio: 1 \/ 1/);
});
