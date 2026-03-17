import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKTREE_ROOT = join(__dirname, '..', '..');

const GO_STATIC_CANDIDATES = [
  join(WORKTREE_ROOT, 'foos2Go', 'static'),
  join(WORKTREE_ROOT, 'meituanGo', 'static'),
];

async function findGoStaticRoot() {
  for (const dir of GO_STATIC_CANDIDATES) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      if (entries) return dir;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const FILE_EXTS = new Set(['.html', '.js']);

const UNSAFE_PATTERNS = [
  { id: 'dangerouslySetInnerHTML', re: /\bdangerouslySetInnerHTML\b/ },
  { id: 'document.write', re: /\bdocument\.write\s*\(/ },
  { id: 'insertAdjacentHTML', re: /\binsertAdjacentHTML\s*\(/ },
  { id: 'innerHTML assignment', re: /\binnerHTML\s*=/ },
  { id: 'outerHTML assignment', re: /\bouterHTML\s*=/ },
];

function toPosixPath(p) {
  return String(p).split('\\').join('/');
}

function hasAllowedExt(absPath) {
  const p = toPosixPath(absPath);
  const dot = p.lastIndexOf('.');
  if (dot === -1) return false;
  return FILE_EXTS.has(p.slice(dot));
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
    if (entry.isFile() && hasAllowedExt(abs)) files.push(abs);
  }
  return files;
}

test('security: go static/** should not use unsafe DOM sinks', async () => {
  const root = await findGoStaticRoot();
  if (!root) return;
  const files = await walkFiles(root);

  const hits = [];
  for (const fileAbsPath of files) {
    let content;
    try {
      content = await readFile(fileAbsPath, 'utf8');
    } catch {
      continue;
    }

    for (const pat of UNSAFE_PATTERNS) {
      if (pat.re.test(content)) {
        hits.push({
          pattern: pat.id,
          file: toPosixPath(relative(WORKTREE_ROOT, fileAbsPath)),
        });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits
    .slice(0, 50)
    .map((h) => `- ${h.pattern}\t${h.file}`)
    .join('\n');
  const suffix = hits.length > 50 ? `\n... and ${hits.length - 50} more` : '';

  assert.fail(`Unsafe DOM sink usage found in meituanGo/static/**:\n${preview}${suffix}`);
});
