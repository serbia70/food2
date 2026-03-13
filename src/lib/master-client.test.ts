import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createMasterClient } from './master-client.ts';

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

test('master client uses relative /api/master/* paths and JSON for init/manage/backup/logout', async () => {
  const calls: Array<{ url: string | URL; init?: RequestInit }> = [];
  const mockFetch = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { success: true };
      },
    } as any;
  };

  const client = createMasterClient({ fetch: mockFetch as any });

  await client.init();
  await client.manage('trigger_backup', { foo: 'bar' });
  await client.backup('list');
  await client.backup('delete', 'b1.zip');
  await client.logout();

  assert.equal(String(calls[0].url), '/api/master/init');
  assert.equal(calls[0].init?.method, 'GET');

  assert.equal(String(calls[1].url), '/api/master/manage');
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal((calls[1].init?.headers as any)?.['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { action: 'trigger_backup', foo: 'bar' });

  assert.equal(String(calls[2].url), '/api/master/backup');
  assert.equal(calls[2].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { action: 'list' });

  assert.equal(String(calls[3].url), '/api/master/backup');
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { action: 'delete', backupName: 'b1.zip' });

  assert.equal(String(calls[4].url), '/api/master/logout');
  assert.equal(calls[4].init?.method, 'POST');
});

test('master client restore/upload support FormData pass-through (no manual Content-Type)', async () => {
  const calls: Array<{ url: string | URL; init?: RequestInit }> = [];
  const mockFetch = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200 } as any;
  };

  const client = createMasterClient({ fetch: mockFetch as any });

  const fd = new FormData();
  fd.append('file', new Blob(['x'], { type: 'application/zip' }), 'backup.zip');

  await client.restore(fd);
  await client.upload(fd);

  assert.equal(String(calls[0].url), '/api/master/restore');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.body, fd);
  assert.ok(!calls[0].init?.headers, 'expected no headers to be set for FormData');

  assert.equal(String(calls[1].url), '/api/master/upload');
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(calls[1].init?.body, fd);
  assert.ok(!calls[1].init?.headers, 'expected no headers to be set for FormData');
});

test('master client restore/upload also allow JSON bodies', async () => {
  const calls: Array<{ url: string | URL; init?: RequestInit }> = [];
  const mockFetch = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200 } as any;
  };

  const client = createMasterClient({ fetch: mockFetch as any });

  await client.restore({ hello: 'world' });
  await client.upload({ ping: true });

  assert.equal(String(calls[0].url), '/api/master/restore');
  assert.equal((calls[0].init?.headers as any)?.['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { hello: 'world' });

  assert.equal(String(calls[1].url), '/api/master/upload');
  assert.equal((calls[1].init?.headers as any)?.['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { ping: true });
});
