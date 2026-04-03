import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cardPath = resolve(process.cwd(), 'src/components/master/MasterServerSettingsCard.astro');

test('MasterServerSettingsCard keeps telegram test button wired to the current form and shared feedback area', async () => {
  const source = await readFile(cardPath, 'utf8');

  assert.match(source, /onsubmit="return window\.submitMasterServerSettings \? window\.submitMasterServerSettings\(this\) : false;"/);
  assert.match(source, /data-master-telegram-test-button/);
  assert.match(source, /onclick="return window\.submitMasterServerTelegramTest \? window\.submitMasterServerTelegramTest\(this\.form\) : false;"/);
  assert.match(source, /发送测试信息/);
  assert.match(source, /name="telegramChatId"/);
  assert.match(source, /name="telegramBotToken"/);
  assert.match(source, /value=\{settings\.telegramChatId\}/);
  assert.match(source, /value=\{settings\.telegramBotToken\}/);
  assert.match(source, /id="master-server-settings-feedback"/);
  assert.match(source, /修改后请同步确认客户端、打印机和 Telegram 机器人回调配置是否仍然可用。/);
});

test('master settings page exposes telegram test handler on window', async () => {
  const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /Object\.assign\(window, \{/);
  assert.match(source, /submitMasterServerTelegramTest:\s*settingsFormBindings\.submitMasterServerTelegramTest/);
});
