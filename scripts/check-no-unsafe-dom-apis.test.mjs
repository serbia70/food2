import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..');
const SRC_ROOT = join(REPO_ROOT, 'src');

const UNSAFE_SINKS = [
  'innerHTML',
  'insertAdjacentHTML',
  'outerHTML',
  'document.write',
  'dangerouslySetInnerHTML',
];

function toPosixPath(p) {
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

test('security: src/** should not use unsafe DOM sinks', async () => {
  const files = await walkFiles(SRC_ROOT);

  const hits = [];
  for (const fileAbsPath of files) {
    let content;
    try {
      content = await readFile(fileAbsPath, 'utf8');
    } catch {
      // If a non-text file slips into src/, skip it to avoid flaky test failures.
      continue;
    }

    for (const needle of UNSAFE_SINKS) {
      if (content.includes(needle)) {
        hits.push({
          needle,
          file: toPosixPath(relative(REPO_ROOT, fileAbsPath)),
        });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits
    .slice(0, 30)
    .map((h) => `- ${h.needle}\t${h.file}`)
    .join('\n');
  const suffix = hits.length > 30 ? `\n... and ${hits.length - 30} more` : '';

  assert.fail(`Unsafe DOM sink usage found in src/**:\n${preview}${suffix}`);
});
