import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DIST_ROOT = join(REPO_ROOT, 'dist');

const SKIP_PATH_SUBSTRINGS = [
  '/vendor/',
];

// Keep this list narrow to avoid false positives from framework internals.
// NOTE: `dangerouslySetInnerHTML` can appear in framework/runtime bundles even when app code never uses it.
const NEEDLES = [
  'document.write(',
  'insertAdjacentHTML(',
  'new Function(',
  'eval(',
];

function toPosixPath(p) {
  return p.replaceAll('\\', '/');
}

function shouldSkip(absPath) {
  const p = toPosixPath(absPath);
  return SKIP_PATH_SUBSTRINGS.some((s) => p.includes(s));
}

async function walkFiles(dirAbsPath) {
  const entries = await readdir(dirAbsPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = join(dirAbsPath, entry.name);
    if (shouldSkip(abs)) continue;
    if (entry.isDirectory()) files.push(...(await walkFiles(abs)));
    else if (entry.isFile()) files.push(abs);
  }
  return files;
}

test('security: dist/** should not contain unsafe DOM sinks', async () => {
  let files;
  try {
    files = await walkFiles(DIST_ROOT);
  } catch {
    assert.fail('dist/ not found; run `npm run build` first');
  }

  const hits = [];
  for (const fileAbsPath of files) {
    let content;
    try {
      content = await readFile(fileAbsPath, 'utf8');
    } catch {
      continue;
    }

    for (const needle of NEEDLES) {
      if (content.includes(needle)) {
        hits.push({
          needle,
          file: toPosixPath(relative(REPO_ROOT, fileAbsPath)),
        });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits.slice(0, 30).map((h) => `- ${h.needle}\t${h.file}`).join('\n');
  const suffix = hits.length > 30 ? `\n... and ${hits.length - 30} more` : '';

  assert.fail(`Unsafe DOM sink strings found in dist/**:\n${preview}${suffix}`);
});
