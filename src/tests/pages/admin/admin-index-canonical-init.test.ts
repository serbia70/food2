import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const settingsComponentPath = resolve(process.cwd(), 'src/components/admin/TabSettings.astro');

test('admin index source reads canonical-unwrapped shop payload from fetchJSON and falls back to home shop row', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const fallbackHomeShop = Array\.isArray\(homeData\?\.shops\)/);
  assert.match(page, /find\(\(entry: any\) => String\(entry\?\.slug \|\| ''\) === String\(slug\)\)/);
  assert.match(page, /const rawShop = asObject\(shopResp\.data \|\| fallbackHomeShop\);/);
  assert.match(page, /fetchJSON\(`\$\{API_BASE_URL\}\/api\/home`\)/);
  assert.match(page, /const safeShopId = Number\(rawShop\?\.id \|\| slug \|\| 0\);/);
  assert.match(page, /const shop = \{/);
  assert.match(page, /id: safeShopId,/);
  assert.match(page, /slug: String\(rawShop\.slug \|\| slug\),/);
  assert.match(page, /name: String\(rawShop\.name \|\| slug\),/);
  assert.doesNotMatch(page, /return new Response\('Backend unavailable', \{ status: shopResp\.status \|\| 503 \}\);/);
  assert.doesNotMatch(page, /return new Response\('Shop payload invalid', \{ status: 502 \}\);/);
  assert.doesNotMatch(page, /if \(!shopResp\.ok \|\| !rawShop\?\.id\) \{/);
  assert.doesNotMatch(page, /shopResp\.status === 404 \|\| !rawShop\?\.id/);
  assert.doesNotMatch(page, /shopResp\.data && typeof shopResp\.data === 'object' && 'data' in shopResp\.data/);
});

test('admin settings source uses resolver-driven display settings defaults', async () => {
  const page = await readFile(pagePath, 'utf8');
  const component = await readFile(settingsComponentPath, 'utf8');

  assert.match(page, /resolveShopDisplaySettings\(/);
  assert.match(page, /const masterSettings = asObject\(homeData\?\.settings \|\| \{\}\);/);
  assert.doesNotMatch(page, /const masterSettings = asObject\(homeData\?\.d\?\.settings \|\| \{\}\);/);
  assert.match(page, /const resolvedDisplaySettings = resolveShopDisplaySettings\(/);

  assert.match(component, /value=\{resolvedDisplaySettings\?\.hours\?\.open \|\| ''\}/);
  assert.match(component, /value=\{resolvedDisplaySettings\?\.hours\?\.close \|\| ''\}/);
  assert.match(component, /resolvedDisplaySettings\?\.city === c/);
  assert.match(component, /当前使用全局默认城市/);
  assert.match(component, /当前使用全局默认营业时间/);

  assert.doesNotMatch(component, /settings\.hours\?\.open \|\| shop\.hours\?\.open \|\| shop\.open_time/);
});

test('admin entry source does not preload hidden billing and stats tabs during page init', async () => {
  const entryPath = resolve(process.cwd(), 'src/scripts/admin/admin-entry.ts');
  const settingsUiPath = resolve(process.cwd(), 'src/scripts/admin/settings-ui.ts');
  const customersPath = resolve(process.cwd(), 'src/components/admin/TabCustomers.astro');
  const entry = await readFile(entryPath, 'utf8');
  const settingsUi = await readFile(settingsUiPath, 'utf8');
  const customers = await readFile(customersPath, 'utf8');

  assert.match(entry, /initDefaultStatsDates\(\);/);
  assert.doesNotMatch(entry, /initDefaultDatesAndLoad\(\);/);
  assert.doesNotMatch(entry, /void loadFeeDailySummary\(\);/);
  assert.match(entry, /const lastTab = localStorage\.getItem\('adminLastTab'\) \|\| 'orders';/);
  assert.match(entry, /showTab\(lastTab\);/);
  assert.doesNotMatch(entry, /const lightweightTabs = new Set\(\['orders', 'settings'\]\);/);
  assert.doesNotMatch(entry, /const normalizedInitialTab = lightweightTabs\.has\(lastTab\) \? lastTab : 'orders';/);
  assert.doesNotMatch(settingsUi, /void loadDrivers\(\);/);
  assert.match(settingsUi, /const \{ res, data \} = await fetchJSONWithRetry\('\/api\/rider\/status\?action=list_available'\);/);
  assert.match(settingsUi, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.match(customers, /window\.loadCustomers = loadCustomers;/);
  assert.doesNotMatch(customers, /window\.loadCustomers = loadCustomers;[\s\S]*?loadCustomers\(\);\s*<\/script>/);
  assert.match(customers, /const \{ res, data \} = await fetchJSONWithRetry\('\/api\/admin\/customers'\);/);
  assert.match(customers, /if \(res\.status === 401 \|\| res\.status === 403\)/);
  assert.match(customers, /if \(!res\.ok \|\| !data\.success\)/);
});
