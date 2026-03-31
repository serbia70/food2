import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATED_FOUNDATION_FILES = [
  '../../lib/api-proxy.ts',
  '../../lib/master-auth.ts',
  '../../lib/user-api-route.ts',
  '../../lib/master-api-route.ts',
  '../../pages/api/admin/login.ts',
  '../../pages/api/admin/logout.ts',
  '../../pages/api/auth/check.ts',
  '../../pages/api/master/login.ts',
  '../../pages/api/master/logout.ts',
  '../../pages/api/master/dispatch.ts',
  '../../pages/api/master/riders.ts',
  '../../pages/api/master/shops/[id].ts',
  '../../pages/api/shop/list.ts',
] as const;

const LEGACY_RESPONSE_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'legacy success key', regex: /\bsuccess\s*:/ },
  { name: 'legacy ok status string', regex: /\bstatus\s*:\s*["']ok["']/ },
];

test('migrated foundation source forbids legacy response keys', async () => {
  for (const relativePath of MIGRATED_FOUNDATION_FILES) {
    const absolutePath = resolve(__dirname, relativePath);
    const source = await readFile(absolutePath, 'utf8');

    for (const pattern of LEGACY_RESPONSE_PATTERNS) {
      assert.equal(
        pattern.regex.test(source),
        false,
        `${relativePath} contains ${pattern.name}`,
      );
    }
  }
});
