import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const target = join(root, 'src', 'pages', 'api');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
      continue;
    }
    files.push(full);
  }
  return files;
}

test('src/pages/api 下不应存在 .test.ts 文件', async () => {
  const files = await walk(target);
  const offenders = files
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => relative(root, file).replaceAll('\\', '/'));

  assert.deepEqual(offenders, []);
});
