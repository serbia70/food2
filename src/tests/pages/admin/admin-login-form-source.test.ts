import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const adminLoginFormPath = resolve(process.cwd(), 'src/components/admin/AdminLoginForm.astro');

test('AdminLoginForm source keeps login submit logic inside standalone script tag after service worker branch', async () => {
  const source = await readFile(adminLoginFormPath, 'utf8');

  assert.match(source, /\{import\.meta\.env\.DEV \? \(/);
  assert.match(source, /<script is:inline>[\s\S]*navigator\.serviceWorker\.getRegistrations\(\)[\s\S]*<\/script>/);
  assert.match(source, /<script define:vars=\{\{ swScope, appVersion: APP_VERSION \}\}>[\s\S]*navigator\.serviceWorker\.register\(/);
  assert.match(source, /\)\s*\}\s*\n\s*<script is:inline>[\s\S]*document\.getElementById\('login-form'\)\.addEventListener\('submit'/);
  assert.doesNotMatch(source, /\)\s*\}\s*document\.getElementById\('login-form'\)/);
});
