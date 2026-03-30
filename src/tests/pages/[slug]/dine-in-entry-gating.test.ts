import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');

test('shop page source blocks dine-in entry behind the billing helper', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /import \{ buildDineInBillingState \} from '\.\.\/\.\.\/lib\/dine-in-billing\.ts';/);
  assert.match(page, /const dineInBilling = buildDineInBillingState\(shop\);/);
  assert.match(page, /const dineInSubscriptionBlocked = \['stopped', 'auto_closed', 'disabled_unknown'\]\.includes\(dineInBilling\.alertLevel\);/);
  assert.match(page, /const enableDineIn = Number\(shop\?\.enable_dine_in \?\? 1\) !== 0 && !dineInSubscriptionBlocked;/);
});

test('tables mode source blocks dine-in ordering when subscription is closed', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /mode === 'tables'/);
  assert.match(page, /enableDineIn \? \(/);
  assert.match(page, /堂食已关闭/);
  assert.match(page, /enableDineIn && status\.occupied &&/);
});
