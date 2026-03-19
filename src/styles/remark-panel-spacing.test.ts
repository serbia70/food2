import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cssPath = resolve(process.cwd(), 'src/styles/global.css');

function getRule(css: string, selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

test('remark panel has space below the toggle header', async () => {
  const css = await readFile(cssPath, 'utf8');
  const panelRule = getRule(css, '.remark-ui .remarks-panel');

  assert.ok(panelRule.includes('margin-top: 12px;'));
});
