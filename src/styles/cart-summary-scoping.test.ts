import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cssPath = resolve(process.cwd(), 'src/styles/global.css');

test('cart-summary styles are scoped to the user modal footer', async () => {
  const css = await readFile(cssPath, 'utf8');

  const bareRuleCount = (css.match(/^\.cart-summary\s*\{/gm) || []).length;
  const scopedRuleCount = (css.match(/^\.modal-footer-cart\s+\.cart-summary\s*\{/gm) || []).length;

  assert.equal(bareRuleCount, 1);
  assert.equal(scopedRuleCount, 1);
});
