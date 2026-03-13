import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ lives under meituanAstro/, so from here:
// ../../meituanGo/cmd/server/main.go
const GO_MAIN_PATH = join(__dirname, '..', '..', 'meituanGo', 'cmd', 'server', 'main.go');

function normalizeNewlines(s) {
  return s.replaceAll('\r\n', '\n');
}

test('security: Go server must not expose legacy static HTML entrypoints', async () => {
  const goMain = normalizeNewlines(await readFile(GO_MAIN_PATH, 'utf8'));

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
