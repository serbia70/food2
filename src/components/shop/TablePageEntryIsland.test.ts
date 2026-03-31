import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const entryPath = resolve(process.cwd(), 'src/components/shop/TablePageEntryIsland.tsx');

test('TablePageEntryIsland keeps .ts script import so shop page hydration can register window actions', async () => {
  const source = await readFile(entryPath, 'utf8');

  assert.match(source, /from '\.\.\/\.\.\/scripts\/shop\/table-page\.ts'/);
});
