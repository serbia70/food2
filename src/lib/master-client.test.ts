import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function extractAstroFrontmatter(source: string) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  assert.ok(match, 'expected Astro frontmatter block');
  return match[1];
}

function extractConstString(frontmatter: string, name: string) {
  const re = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(['\"])\\s*([^'\"]+?)\\s*\\1\\s*;`);
  const match = frontmatter.match(re);
  assert.ok(match, `expected ${name} constant`);
  return match[2];
}

test('master SSR init 使用同域 /api/master/init 且显式转发 cookie', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const masterIndexPath = resolve(here, '..', 'pages', 'master', 'index.astro');
  const source = readFileSync(masterIndexPath, 'utf8');
  const frontmatter = extractAstroFrontmatter(source);

  const initPath = extractConstString(frontmatter, 'MASTER_INIT_PROXY_PATH');
  const cookieHeader = extractConstString(frontmatter, 'MASTER_INIT_COOKIE_HEADER');

  assert.equal(initPath, '/api/master/init');
  assert.equal(cookieHeader, 'cookie');

  // Ensure the SSR init fetch uses the same-origin proxy URL and forwards cookie explicitly.
  assert.ok(frontmatter.includes('new URL(MASTER_INIT_PROXY_PATH, Astro.url)'), 'expected initUrl to be built from proxy path and Astro.url');
  assert.ok(frontmatter.includes('Astro.request.headers.get(MASTER_INIT_COOKIE_HEADER)'), 'expected cookie to be read from incoming request headers');
  assert.ok(frontmatter.includes('...(cookie ? { cookie } : {})'), 'expected cookie header to be forwarded in fetch');

  // Proxy-only invariant: master SSR should not hit API_BASE_URL directly.
  assert.ok(!frontmatter.includes('API_BASE_URL'), 'expected no API_BASE_URL usage in master SSR init');
});
