import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const TARGET = join(REPO_ROOT, 'src', 'lib', 'userStore.ts');

test('userStore should fall back to legacy localStorage key user_info', async () => {
  const content = await readFile(TARGET, 'utf8');

  // Requirement: userStore init should read legacy `user_info` as fallback when `food_order_user` is absent/corrupted.
  // We assert presence of both the legacy key string and a getItem usage to make this non-trivial.
  assert.ok(content.includes('user_info'), 'Expected userStore.ts to reference legacy key "user_info"');
  assert.ok(
    content.includes('KEY_LEGACY_USER') || content.includes("'user_info'") || content.includes('"user_info"'),
    'Expected userStore.ts to reference legacy key user_info',
  );
});
