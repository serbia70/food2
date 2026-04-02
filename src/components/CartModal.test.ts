import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/CartModal.tsx');

test('CartModal source uses canonical item subname fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /\.map\(\(i\) => `\$\{i\.name\}\$\{i\.subName \? " " \+ i\.subName : ""\} x\$\{i\.quantity\}`\)/);
  assert.match(source, /<div className="cart-item-desc">\{item\.subName\}<\/div>/);

  assert.doesNotMatch(source, /i\.sub_name/);
  assert.doesNotMatch(source, /item\.sub_name/);
});
