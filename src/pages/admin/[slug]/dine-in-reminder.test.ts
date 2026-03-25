import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
const tabRenewPath = resolve(process.cwd(), 'src/components/admin/TabRenew.astro');

test('admin page source wires the dine-in reminder card from the shared helper', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildDineInBillingState \} from '\.\.\/\.\.\/\.\.\/lib\/dine-in-billing\.ts';/);
  assert.match(page, /const dineInBilling = buildDineInBillingState\(shop\);/);
  assert.match(page, /id="admin-dine-in-reminder-card"/);
  assert.match(page, /dineInBilling\.statusLabel/);
  assert.match(page, /dineInBilling\.billingStartAt/);
  assert.match(page, /计费开始/);
  assert.match(page, /dineInBilling\.expiresAt/);
  assert.match(page, /dineInBilling\.graceUntil/);
  assert.match(page, /dineInStopReason/);
  assert.match(page, /dineInToggleLabel/);
});

test('renewal tab copy clarifies the wallet is only for booking and delivery', async () => {
  const tabRenew = await readFile(tabRenewPath, 'utf8');

  assert.match(tabRenew, /预订\s*\/\s*外卖/);
  assert.match(tabRenew, /堂食年费/);
  assert.match(tabRenew, /仅用于预订/);
});
