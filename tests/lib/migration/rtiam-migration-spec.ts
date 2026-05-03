import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMigrationStatsComparison,
  buildImportedSettings,
  buildShopInsertRecord,
  normalizeLegacyTableConfig,
} from '../../../src/lib/rtiam-migration.ts';

test('buildImportedSettings 保留旧字段，不额外注入桌号首页配置', () => {
  const result = buildImportedSettings('{"hours":{"open":"10:00"},"contact":{"phone":"1"}}');
  assert.equal(result.hours.open, '10:00');
  assert.equal(result.contact.phone, '1');
  assert.equal('homeEntry' in result, false);
});

test('normalizeLegacyTableConfig 保留旧版桌台前缀配置', () => {
  const result = normalizeLegacyTableConfig('{"zones":[{"name":"大厅","count":4,"prefix":"大厅"},{"name":"自取","count":2,"prefix":"自取"}]}');
  assert.deepEqual(result, {
    zones: [
      { name: '大厅', count: 4, prefix: '大厅' },
      { name: '自取', count: 2, prefix: '自取' },
    ],
  });
});

test('buildShopInsertRecord 把旧版 restaurant 记录映射成新版 shops 记录', () => {
  const record = buildShopInsertRecord({
    id: 7,
    name: 'R-TIAM',
    slug: 'rtiam',
    password: 'admin',
    phone: null,
    address: 'Balkanska 7, Beograd',
    status: 'active',
    settings: '{"contact":{"phone":"0693558888"}}',
    expire_date: '2027-02-01',
    last_paid_month: '2025-12',
    commission_type: 'percentage',
    commission_value: 3,
    enable_delivery: 1,
    enable_dine_in: 1,
    enable_reservation: 0,
    mqtt_secret: 'pwtx9l',
    table_config: '{"zones":[{"name":"大厅","count":4,"prefix":"大厅"}]}',
    category: 'food',
    city: 'Belgrade',
    zone: '',
    delivery_type: 'merchant',
  });

  assert.equal(record.id, 7);
  assert.equal(record.slug, 'rtiam');
  assert.equal(record.commission_value, 3);
  assert.equal(record.enable_dine_in, 1);
});

test('buildImportedSettings 处理空 settings 时返回空对象', () => {
  assert.deepEqual(buildImportedSettings(''), {});
});

test('buildMigrationStatsComparison 输出旧库与新库的数量对比', () => {
  const result = buildMigrationStatsComparison({
    legacy: { categories: 3, products: 33, orders: 2114 },
    target: { categories: 2, products: 25, orders: 5 },
  });

  assert.deepEqual(result, {
    categories: { legacy: 3, target: 2, delta: 1, needsImport: true },
    products: { legacy: 33, target: 25, delta: 8, needsImport: true },
    orders: { legacy: 2114, target: 5, delta: 2109, needsImport: true },
  });
});
