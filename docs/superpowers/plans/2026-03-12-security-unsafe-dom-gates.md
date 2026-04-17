# Unsafe DOM Sink Gates Implementation Plan

> 状态说明（历史计划）：这份计划记录的是当时为 unsafe DOM sink 建立门禁时的推进步骤，文中的 `历史红灯预期：` 属于阶段性红灯预期，不应再直接当作当前实现状态。
> 若继续处理 DOM 安全门禁，请先以当前 `scripts/` 与实际安全策略为准，再决定哪些检查仍需保留或扩展。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo-wide safety gates that prevent re-introducing high-risk DOM injection APIs (innerHTML/insertAdjacentHTML/dangerouslySetInnerHTML/document.write) and catch regressions in build output.

**Architecture:** Add Node `--test` scripts (like existing `meituanAstro/scripts/*.test.mjs`) that scan source trees and build output for unsafe sinks. Keep a path-based allowlist for third-party/vendor code. Keep patterns strict enough to avoid false positives.

**Tech Stack:** Node.js built-in test runner (`node --test`), Astro/Preact codebase, Go backend static assets.

---

## File structure / new tests

We’ll extend the existing “gate tests” pattern under `meituanAstro/scripts/`.

- Create: `meituanAstro/scripts/check-no-unsafe-dom-apis-repo.test.mjs`
  - Scans both:
    - `meituanAstro/src/**`
    - `meituanGo/static/**` (legacy/static pages)
    - (Optional, **separate task** later) `meituanGo/internal/**.go` for `template.HTML` / `template.JS` usage
  - Uses a small allowlist for vendor/minified third-party code paths.

- Create: `meituanAstro/scripts/scan-dist-no-unsafe-dom-sinks.test.mjs`
  - Scans `meituanAstro/dist/**` after `npm run build`.
  - Uses a narrower needle set to avoid false positives from framework internals.

- Keep: `meituanAstro/scripts/check-no-unsafe-dom-apis.test.mjs`
  - This already scans `meituanAstro/src/**` for unsafe sink substrings.
  - We will leave it as-is initially (it’s already useful) and add the repo-wide gate as a superset.

---

### Task 1: Repo-wide unsafe DOM sink gate (source)

**Files:**
- Create: `meituanAstro/scripts/check-no-unsafe-dom-apis-repo.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `meituanAstro/scripts/check-no-unsafe-dom-apis-repo.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NOTE: scripts/ lives under meituanAstro/, repo root is one level up.
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

// Use more specific patterns than a raw "innerHTML" substring to avoid false positives.
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
  return p.replaceAll('\\\\', '/');
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
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run:

```bash
cd meituanAstro
node --test scripts/check-no-unsafe-dom-apis-repo.test.mjs
```

历史红灯预期： if any unsafe patterns exist in the expanded scan surface.

- [ ] **Step 3: Make minimal changes to pass (GREEN)**

If it fails, fix the *specific* hit(s) only:
- For Preact components: replace `dangerouslySetInnerHTML` with JSX rendering and safe `textContent` via normal element children.
- For DOM code: replace `innerHTML/insertAdjacentHTML` with `document.createElement`, `textContent`, and `appendChild`.
- For static HTML: remove inline script that writes HTML; use server-rendered HTML or build-time rendering.

Keep changes minimal: fix only the lines caught by the gate.

- [ ] **Step 4: Re-run test to verify it passes**

Run:

```bash
cd meituanAstro
node --test scripts/check-no-unsafe-dom-apis-repo.test.mjs
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add meituanAstro/scripts/check-no-unsafe-dom-apis-repo.test.mjs
# plus any fixed files

git commit -m "test(security): forbid unsafe DOM sinks across repo"
```

---

### Task 2: Dist (build output) unsafe sink gate

**Files:**
- Create: `meituanAstro/scripts/scan-dist-no-unsafe-dom-sinks.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `meituanAstro/scripts/scan-dist-no-unsafe-dom-sinks.test.mjs`:

```js
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
const NEEDLES = [
  'dangerouslySetInnerHTML',
  'document.write(',
  'insertAdjacentHTML(',
  'new Function(',
  'eval(',
];

function toPosixPath(p) {
  return p.replaceAll('\\\\', '/');
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
    // dist missing => build not run.
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
```

- [ ] **Step 2: Run build then run test (RED)**

Run:

```bash
cd meituanAstro
npm run build
node --test scripts/scan-dist-no-unsafe-dom-sinks.test.mjs
```

Expected: either PASS, or FAIL listing which dist files contain needles.

- [ ] **Step 3: Fix only the reported sources (GREEN)**

If a needle appears:
- Map it back to source (often a component or inline script).
- Replace unsafe sink usage as in Task 1.
- Rebuild and re-run the scan.

- [ ] **Step 4: Verify passes**

```bash
cd meituanAstro
npm run build
node --test scripts/scan-dist-no-unsafe-dom-sinks.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add meituanAstro/scripts/scan-dist-no-unsafe-dom-sinks.test.mjs

git commit -m "test(security): scan dist for unsafe DOM sinks"
```

---

### Task 3: Make gates easy to run (verification commands)

**Files:**
- Modify (optional): `meituanAstro/package.json` (add a `test:security` script)

- [ ] **Step 1: Write failing test expectation**

We want a single command to run the security gates.

- [ ] **Step 2: Implement minimal script entry**

Add to `meituanAstro/package.json`:

```json
{
  "scripts": {
    "test:security": "node --test scripts/check-no-unsafe-dom-apis.test.mjs scripts/check-no-unsafe-dom-apis-repo.test.mjs scripts/check-no-public-secrets-in-src.test.mjs scripts/scan-dist-no-secrets.test.mjs scripts/scan-dist-no-unsafe-dom-sinks.test.mjs"
  }
}
```

- [ ] **Step 3: Verify**

```bash
cd meituanAstro
npm run build
npm run test:security
```

- [ ] **Step 4: Commit**

```bash
git add meituanAstro/package.json

git commit -m "chore(security): add test:security gate runner"
```

---

## Notes / Non-goals (explicit)

- This plan does **not** attempt a broad refactor to "delete all invalid code" or "unify all logic"; it establishes safety guardrails first.
- After these gates exist, we can take the next sub-project: (a) deduplicate auth/session logic, (b) unify storage keys and routes, (c) remove dead code paths—each as its own spec+plan.
