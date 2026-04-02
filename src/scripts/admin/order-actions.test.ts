import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/scripts/admin/order-actions.ts');

test('order-actions source exposes assign/auto-assign actions and no broadcast entry', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /registerAdminGlobal\('assign-rider'/);
  assert.match(source, /registerAdminGlobal\('auto-assign-rider'/);
  assert.doesNotMatch(source, /registerAdminGlobal\('broadcast-rider-dispatch'/);
  assert.doesNotMatch(source, /broadcastRiderDispatch\(/);

  assert.doesNotMatch(source, /__adminDispatchCursor/);
  assert.doesNotMatch(source, /lastAssignedRiderId/);
  assert.doesNotMatch(source, /registerAdminGlobal\('remind-riders'/);
  assert.doesNotMatch(source, /registerAdminGlobal\('contact-riders'/);
  assert.doesNotMatch(source, /remindAwaitingOrder/);
  assert.doesNotMatch(source, /contactRidersForOrder/);
  assert.doesNotMatch(source, /getReminderCountFromDataset/);
  assert.doesNotMatch(source, /remindRiders\(/);
});

test('assign-rider prompts rider selection before ETA while auto-assign keeps ETA-first flow', async () => {
  const source = await readFile(filePath, 'utf8');

  const assignStart = source.indexOf("registerAdminGlobal('assign-rider'");
  const autoStart = source.indexOf("registerAdminGlobal('auto-assign-rider'");
  assert.ok(assignStart >= 0, 'assign-rider handler should exist');
  assert.ok(autoStart > assignStart, 'auto-assign handler should exist after assign handler');

  const assignBlock = source.slice(assignStart, autoStart);
  const assignRiderPromptIdx = assignBlock.indexOf('选择要指派的骑手');
  const assignEtaPromptIdx = assignBlock.indexOf('请选择预计取餐时间');
  assert.ok(assignRiderPromptIdx >= 0, 'assign-rider should prompt rider selection');
  assert.ok(assignEtaPromptIdx >= 0, 'assign-rider should prompt eta selection');
  assert.ok(assignRiderPromptIdx < assignEtaPromptIdx, 'assign-rider should prompt rider before eta');

  const autoBlock = source.slice(autoStart);
  const autoEtaPromptIdx = autoBlock.indexOf('请选择预计取餐时间');
  assert.ok(autoEtaPromptIdx >= 0, 'auto-assign should keep eta prompt');
});
