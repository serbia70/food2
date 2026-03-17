import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKTREE_ROOT = join(__dirname, '..', '..');

const GO_MAIN_CANDIDATES = [
  join(WORKTREE_ROOT, 'foos2Go', 'cmd', 'server', 'main.go'),
  join(WORKTREE_ROOT, 'meituanGo', 'cmd', 'server', 'main.go'),
];

async function readGoMain() {
  for (const p of GO_MAIN_CANDIDATES) {
    try {
      return await readFile(p, 'utf8');
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeNewlines(s) {
  // Keep test helpers compatible with older JS runtimes.
  return String(s || '').split('\r\n').join('\n');
}

test('security: Go server must not expose legacy static HTML entrypoints', async () => {
  const rawGoMain = await readGoMain();
  if (!rawGoMain) return;
  const goMain = normalizeNewlines(rawGoMain);

  // 1) No legacy root entrypoints mounted as static files.
  // Redirect-based routes are allowed; this gate only forbids serving the old HTML files.
  const forbidden = [
    {
      id: 'r.StaticFile("/admin.html", ...) (legacy admin HTML entrypoint)',
      re: /\br\.StaticFile\(\s*["']\/admin\.html["']\s*,/,
    },
    {
      id: 'r.StaticFile("/master.html", ...) (legacy master HTML entrypoint)',
      re: /\br\.StaticFile\(\s*["']\/master\.html["']\s*,/,
    },

    // 2) No serving the legacy SPA HTML directly from Go.
    {
      id: 'c.File("./static/index.html") (legacy static SPA entrypoint)',
      re: /\bc\.File\(\s*["']\.\/static\/index\.html["']\s*\)/,
    },
  ];

  const hits = forbidden.filter((p) => p.re.test(goMain)).map((p) => `- ${p.id}`);
  if (hits.length > 0) {
    assert.fail(`Go legacy HTML entrypoints must be removed:\n${hits.join('\n')}`);
  }

  // 3) NoRoute is allowed, but must not serve ./static/index.html.
  if (/\br\.NoRoute\s*\(/.test(goMain)) {
    assert.ok(
      !/\br\.NoRoute\s*\([\s\S]*?\bc\.File\(\s*["']\.\/static\/index\.html["']\s*\)[\s\S]*?\)\s*/.test(
        goMain,
      ),
      'r.NoRoute(...) must not serve ./static/index.html',
    );
  }
});
