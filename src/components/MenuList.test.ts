import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/MenuList.tsx');

test('MenuList source uses canonical product subname fields', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /subName: source\?\.subName \?\? product\.productSubName,/);
  assert.match(source, /\{p\.subName\}<\/div>/);

  assert.doesNotMatch(source, /sub_name/);
});
