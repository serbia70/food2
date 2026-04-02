import test from 'node:test';
import assert from 'node:assert';
import { resolveShopDisplaySettings } from './shop-display-settings.ts';

test('resolveShopDisplaySettings tests', async (t) => {
  await t.test('returns empty structure when input is null or empty', () => {
    const result = resolveShopDisplaySettings(null as unknown, null as unknown, null as unknown);
    assert.deepStrictEqual(result, {
      city: '',
      hours: { open: '', close: '' },
      hasShopCityOverride: false,
      hasShopHoursOverride: false,
    });
  });

  await t.test('prefers shop city over master defaults', () => {
    const shop = { city: 'ShopCity' };
    const masterSettings = { shopDefaults: { city: 'MasterCity' } };
    const result = resolveShopDisplaySettings(shop as unknown, {}, masterSettings as unknown);
    assert.strictEqual(result.city, 'ShopCity');
    assert.strictEqual(result.hasShopCityOverride, true);
  });

  await t.test('falls back to master city when shop city is missing', () => {
    const shop = {};
    const masterSettings = { shopDefaults: { city: 'MasterCity' } };
    const result = resolveShopDisplaySettings(shop as unknown, {}, masterSettings as unknown);
    assert.strictEqual(result.city, 'MasterCity');
    assert.strictEqual(result.hasShopCityOverride, false);
  });

  await t.test('uses shop hours only when both open and close are present', () => {
    const shopSettings = { hours: { open: '09:00', close: '21:00' } };
    const masterSettings = { shopDefaults: { hours: { open: '08:00', close: '22:00' } } };
    const result = resolveShopDisplaySettings({}, shopSettings as unknown, masterSettings as unknown);
    assert.deepStrictEqual(result.hours, { open: '09:00', close: '21:00' });
    assert.strictEqual(result.hasShopHoursOverride, true);
  });

  await t.test('falls back to master hours when shop hours are incomplete', () => {
    const shopSettings = { hours: { open: '09:00' } }; // Missing close
    const masterSettings = { shopDefaults: { hours: { open: '08:00', close: '22:00' } } };
    const result = resolveShopDisplaySettings({}, shopSettings as unknown, masterSettings as unknown);
    assert.deepStrictEqual(result.hours, { open: '08:00', close: '22:00' });
    assert.strictEqual(result.hasShopHoursOverride, false);
  });

  await t.test('falls back to legacy flat master default hours when canonical shopDefaults are absent', () => {
    const result = resolveShopDisplaySettings(
      {},
      {} as unknown,
      { default_open_time: '10:30', default_close_time: '23:00' } as unknown,
    );
    assert.deepStrictEqual(result.hours, { open: '10:30', close: '23:00' });
    assert.strictEqual(result.hasShopHoursOverride, false);
  });

  await t.test('handles dirty inputs gracefully', () => {
    const result = resolveShopDisplaySettings(
      { city: 123 } as unknown,
      { city: null, hours: 'invalid' } as unknown,
      { shopDefaults: { city: ['arr'] } } as unknown
    );
    assert.strictEqual(result.city, '');
    assert.deepStrictEqual(result.hours, { open: '', close: '' });
  });

  await t.test('prefers shopSettings.city over shop.city', () => {
    const shop = { city: 'ShopCity' };
    const shopSettings = { city: 'SettingsCity' };
    const result = resolveShopDisplaySettings(shop as unknown, shopSettings as unknown, {});
    assert.strictEqual(result.city, 'SettingsCity');
    assert.strictEqual(result.hasShopCityOverride, true);
  });

  await t.test('treats whitespace-only strings as empty', () => {
    const shopSettings = { city: '   ', hours: { open: '  ', close: '  ' } };
    const masterSettings = { shopDefaults: { city: 'Master', hours: { open: '08:00', close: '22:00' } } };
    const result = resolveShopDisplaySettings({}, shopSettings as unknown, masterSettings as unknown);
    assert.strictEqual(result.city, 'Master');
    assert.deepStrictEqual(result.hours, { open: '08:00', close: '22:00' });
  });

  await t.test('falls back to shop.city when shopSettings.city is whitespace', () => {
    const shop = { city: 'ShopCity' };
    const shopSettings = { city: '   ' };
    const result = resolveShopDisplaySettings(shop as unknown, shopSettings as unknown, {});
    assert.strictEqual(result.city, 'ShopCity');
    assert.strictEqual(result.hasShopCityOverride, true);
  });
});
