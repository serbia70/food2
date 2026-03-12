import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ lives under meituanAstro/, repo root is one level up.
const REPO_ROOT = join(__dirname, '..');

const TARGET_DIRS = [
  join(REPO_ROOT, 'src'),
  join(REPO_ROOT, 'meituanGo', 'static'),
];

// Path-based allowlist for third-party/minified code.
const SKIP_PATH_SUBSTRINGS = [
  'meituanGo/static/vendor/',
  'meituanAstro/public/vendor/',
  'meituanAstro/src/vendor/',
  '/node_modules/',
];

const FILE_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx', '.astro', '.html']);

const UNSAFE_PATTERNS = [
  { id: 'dangerouslySetInnerHTML', re: /\bdangerouslySetInnerHTML\b/ },
  { id: 'document.write', re: /\bdocument\.write\s*\(/ },
  { id: 'insertAdjacentHTML', re: /\binsertAdjacentHTML\s*\(/ },
  { id: 'innerHTML assignment', re: /\binnerHTML\s*=/ },
  { id: 'outerHTML assignment', re: /\bouterHTML\s*=/ },
  { id: 'eval', re: /\beval\s*\(/ },
  { id: 'new Function', re: /\bnew\s+Function\b/ },
];

function toPosixPath(p) {
  return p.replaceAll('\\', '/');
}

function shouldSkip(absPath) {
  const p = toPosixPath(absPath);
  return SKIP_PATH_SUBSTRINGS.some((s) => p.includes(s));
}

function hasAllowedExt(absPath) {
  const p = toPosixPath(absPath);
  const dot = p.lastIndexOf('.');
  if (dot === -1) return false;
  return FILE_EXTS.has(p.slice(dot));
}

async function walkFiles(dirAbsPath) {
  let entries;
  try {
    entries = await readdir(dirAbsPath, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = join(dirAbsPath, entry.name);
    if (shouldSkip(abs)) continue;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs)));
      continue;
    }
    if (entry.isFile() && hasAllowedExt(abs)) files.push(abs);
  }
  return files;
}

test('security: repo should not use unsafe DOM sinks in source trees', async () => {
  const files = [];
  for (const dir of TARGET_DIRS) files.push(...(await walkFiles(dir)));

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
          file: toPosixPath(relative(REPO_ROOT, fileAbsPath)),
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

  assert.fail(`Unsafe DOM sink usage found in repo source trees:\n${preview}${suffix}`);
});
