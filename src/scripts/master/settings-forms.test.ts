import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { initMasterSettingsForms } from './settings-forms.ts';

const settingsFormsPath = resolve(process.cwd(), 'src/scripts/master/settings-forms.ts');

test('submitMasterShopDefaultsSettings submits canonical shopDefaults payload only', async () => {
  const calls: Array<{ form: HTMLFormElement; config: Parameters<typeof initMasterSettingsForms>[0]['submitSettingsAction'] extends (form: HTMLFormElement, config: infer T) => Promise<void> ? T : never }> = [];

  const actions = initMasterSettingsForms({
    async submitSettingsAction(form, config) {
      calls.push({ form, config });
    },
    readNumberField() {
      throw new Error('readNumberField should not be used');
    },
    setFeedback() {},
  });

  const form = {
    entries: {
      defaultCity: ' Beograd ',
      defaultOpenTime: '09:30',
      defaultCloseTime: '22:00',
    },
  } as HTMLFormElement & {
    entries: Record<string, string>;
  };

  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class FakeFormData {
    private readonly entries: Record<string, string>;

    constructor(source: typeof form) {
      this.entries = source.entries;
    }

    get(key: string) {
      return this.entries[key] ?? null;
    }
  } as typeof FormData;

  actions.submitMasterShopDefaultsSettings(form);
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.endpoint, '/api/master/settings');
  assert.deepEqual(calls[0].config.buildPayload(form), {
    shopDefaults: {
      city: 'Beograd',
      hours: {
        open: '09:30',
        close: '22:00',
      },
    },
    default_city: 'Beograd',
    default_open_time: '09:30',
    default_close_time: '22:00',
  });

  const payloadJson = JSON.stringify(calls[0].config.buildPayload(form));
  assert.doesNotMatch(payloadJson, /shop_defaults/);
  globalThis.FormData = OriginalFormData;
});

test('settings-forms source keeps canonical shop defaults and includes legacy compatibility keys', async () => {
  const source = await readFile(settingsFormsPath, 'utf8');

  assert.match(source, /shopDefaults:\s*\{/);
  assert.match(source, /default_city:/);
  assert.match(source, /default_open_time:/);
  assert.match(source, /default_close_time:/);
  assert.doesNotMatch(source, /shop_defaults:\s*\{/);
});

test('submitMasterRateSettings submits canonical rate payload only', async () => {
  const calls: Array<{ form: HTMLFormElement; config: Parameters<typeof initMasterSettingsForms>[0]['submitSettingsAction'] extends (form: HTMLFormElement, config: infer T) => Promise<void> ? T : never }> = [];

  const actions = initMasterSettingsForms({
    async submitSettingsAction(form, config) {
      calls.push({ form, config });
    },
    readNumberField(formData, key) {
      return Number(formData.get(key));
    },
    setFeedback() {},
  });

  const form = {
    entries: {
      exchangeRate: '18.2',
      displayFinalRate: '19.5',
      rateBase: '17.8',
      rateOffset: '0.6',
      rateStep: '0.1',
    },
  } as HTMLFormElement & {
    entries: Record<string, string>;
  };

  const OriginalFormData = globalThis.FormData;
  const OriginalDocument = globalThis.document;
  globalThis.FormData = class FakeFormData {
    private readonly entries: Record<string, string>;

    constructor(source: typeof form) {
      this.entries = source.entries;
    }

    get(key: string) {
      return this.entries[key] ?? null;
    }
  } as typeof FormData;
  Object.defineProperty(globalThis, 'document', {
    value: {
      getElementById() {
        return null;
      },
    },
    configurable: true,
  });

  actions.submitMasterRateSettings(form);
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.endpoint, '/api/master/settings');
  assert.deepEqual(calls[0].config.buildPayload(form), {
    exchangeRate: 18.2,
    displayFinalRate: 19.5,
    rateBase: 17.8,
    rateOffset: 0.6,
    rateStep: 0.1,
  });

  const payloadJson = JSON.stringify(calls[0].config.buildPayload(form));
  assert.doesNotMatch(payloadJson, /exchange_rate/);
  assert.doesNotMatch(payloadJson, /display_final_rate/);
  assert.doesNotMatch(payloadJson, /rate_base/);
  assert.doesNotMatch(payloadJson, /rate_offset/);
  assert.doesNotMatch(payloadJson, /rate_step/);
  globalThis.FormData = OriginalFormData;
  Object.defineProperty(globalThis, 'document', {
    value: OriginalDocument,
    configurable: true,
  });
});

test('settings-forms source keeps rate, wechat, and payment submission on canonical keys', async () => {
  const source = await readFile(settingsFormsPath, 'utf8');

  assert.match(source, /exchangeRate:\s*readNumberField\(formData, 'exchangeRate'/);
  assert.match(source, /displayFinalRate:\s*readNumberField\(formData, 'displayFinalRate'/);
  assert.match(source, /rateBase:\s*readNumberField\(formData, 'rateBase'/);
  assert.match(source, /rateOffset:\s*readNumberField\(formData, 'rateOffset'/);
  assert.match(source, /rateStep:\s*readNumberField\(formData, 'rateStep'/);
  assert.match(source, /wechatContactQr:\s*String\(formData.get\('wechatContactQr'\)/);
  assert.match(source, /alipayPaymentQr:\s*String\(formData.get\('alipayPaymentQr'\)/);
  assert.match(source, /wechatPaymentQr:\s*String\(formData.get\('wechatPaymentQr'\)/);
  assert.doesNotMatch(source, /exchange_rate/);
  assert.doesNotMatch(source, /display_final_rate/);
  assert.doesNotMatch(source, /rate_base/);
  assert.doesNotMatch(source, /rate_offset/);
  assert.doesNotMatch(source, /rate_step/);
  assert.doesNotMatch(source, /wechat_contact_qr/);
  assert.doesNotMatch(source, /alipay_payment_qr/);
  assert.doesNotMatch(source, /wechat_payment_qr/);
});

test('submitMasterServerSettings submits canonical server payload together with snake_case compatibility keys', async () => {
  const calls: Array<{ form: HTMLFormElement; config: Parameters<typeof initMasterSettingsForms>[0]['submitSettingsAction'] extends (form: HTMLFormElement, config: infer T) => Promise<void> ? T : never }> = [];

  const actions = initMasterSettingsForms({
    async submitSettingsAction(form, config) {
      calls.push({ form, config });
    },
    readNumberField() {
      throw new Error('readNumberField should not be used');
    },
    setFeedback() {},
  });

  const form = {
    entries: {
      mqttBroker: ' mqtt.serbia70.com ',
      telegramWebhookSecret: ' secret-123 ',
      telegramChatId: ' 99887766 ',
      telegramBotToken: ' bot-token-123 ',
    },
  } as HTMLFormElement & {
    entries: Record<string, string>;
  };

  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class FakeFormData {
    private readonly entries: Record<string, string>;

    constructor(source: typeof form) {
      this.entries = source.entries;
    }

    get(key: string) {
      return this.entries[key] ?? null;
    }
  } as typeof FormData;

  actions.submitMasterServerSettings(form);
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.endpoint, '/api/master/settings');
  assert.deepEqual(calls[0].config.buildPayload(form), {
    mqttBroker: 'mqtt.serbia70.com',
    telegramWebhookSecret: 'secret-123',
    telegramChatId: '99887766',
    telegramBotToken: 'bot-token-123',
    mqtt_broker: 'mqtt.serbia70.com',
    telegram_webhook_secret: 'secret-123',
    telegram_chat_id: '99887766',
    telegram_bot_token: 'bot-token-123',
  });

  globalThis.FormData = OriginalFormData;
});
