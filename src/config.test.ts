import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/config.ts');

test('config source does not fall back API_BASE_URL to localhost:3030', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /PUBLIC_API_URL/);
  assert.doesNotMatch(source, /localhost:3030/);
});
