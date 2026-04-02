import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/user/login.ts');

test('user login proxy source forwards to upstream user history route', async () => {
  const file = await readFile(routePath, 'utf8');

  assert.match(file, /buildUserApiUrl\(API_BASE_URL, 'history'\)/);
  assert.doesNotMatch(file, /buildUserApiUrl\(API_BASE_URL, 'login'\)/);
});
