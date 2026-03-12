import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const TARGET = join(REPO_ROOT, 'src', 'components', 'UserCenterPageIsland.tsx');

test('UserCenterPageIsland should render a boot/loading view before deciding guest vs logged-in', async () => {
  const content = await readFile(TARGET, 'utf8');

  // Requirement: eliminate SSR/login flash. Before hydration reads localStorage, UI should not render the guest "请先登录" view.
  // We enforce a bootstrapped/ready gate and a distinct loading copy.
  assert.ok(
    content.includes('bootstrapped') && content.includes('setBootstrapped'),
    'Expected a bootstrapped state gate in UserCenterPageIsland.tsx',
  );

  assert.ok(
    content.includes('正在读取登录态') || content.includes('正在加载'),
    'Expected a loading/boot copy (e.g. "正在读取登录态") in UserCenterPageIsland.tsx',
  );

  // Ensure boot view check appears before the guest view check.
  const bootIdx = content.indexOf('if (!bootstrapped)');
  const guestIdx = content.indexOf('if (!isLoggedIn || !userInfo)');
  assert.ok(bootIdx !== -1, 'Expected `if (!bootstrapped)` guard');
  assert.ok(guestIdx !== -1, 'Expected guest guard `if (!isLoggedIn || !userInfo)`');
  assert.ok(bootIdx < guestIdx, 'Expected boot guard to run before guest view');
});
