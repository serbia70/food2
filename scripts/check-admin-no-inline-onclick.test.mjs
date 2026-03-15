import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const ADMIN_ROOT = join(REPO_ROOT, 'src', 'components', 'admin');

function toPosix(p) {
  return p.replaceAll('\\', '/');
}

async function walkFiles(dirAbsPath) {
  const entries = await readdir(dirAbsPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = join(dirAbsPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs)));
      continue;
    }
    if (entry.isFile()) files.push(abs);
  }
  return files;
}

const ONCLICK_REGEX = /\bonclick\s*=/i;

test('check-admin-no-inline-onclick', async () => {
  const files = await walkFiles(ADMIN_ROOT);

  const hits = [];

  for (const file of files) {
    const relativePath = file.slice(REPO_ROOT.length);
    const posixPath = toPosix(relativePath.startsWith('\\') ? relativePath.slice(1) : relativePath);
    const content = await readFile(file, 'utf-8');

    if (ONCLICK_REGEX.test(content)) {
      hits.push(posixPath);
    }
  }

  if (hits.length > 0) {
    assert.fail(`Found inline onclick attributes in admin components:\n${hits.join('\n')}`);
  }
});
