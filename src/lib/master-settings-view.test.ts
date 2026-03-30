import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterSettingsView } from './master-settings-view.ts';

test('从 settings 中提取预订与外卖默认配置', () => {
  const view = buildMasterSettingsView({
    reservation_enabled: 1,
    reservation_commission_type: 'percentage',
    reservation_commission_value: 0,
    delivery_enabled: 0,
    delivery_commission_type: 'per_order',
    delivery_commission_value: 5,
    subscription_delivery_commission_type: 'percentage',
    subscription_delivery_commission_value: 3,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 35,
  });

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 0);
  assert.equal(view.reservationPlan.displayText, '免费');
  assert.equal(view.reservationPlan.source, 'new');
  assert.equal(view.reservationPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.deliveryPlan.enabled, false);
  assert.equal(view.deliveryPlan.commissionType, 'per_order');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.displayText, '每单 5 RSD');
  assert.equal(view.deliveryPlan.source, 'new');
  assert.equal(view.deliveryPlan.sourceLabel, '店铺覆盖');
  assert.equal(view.subscriptionFeeRsd, 0);
  assert.equal(view.businessFeeRsd, 5);
  assert.equal(view.subscriptionCommissionType, 'percentage');
  assert.equal(view.subscriptionCommissionValue, 0);
  assert.equal(view.businessCommissionType, 'per_order');
  assert.equal(view.businessCommissionValue, 5);
});

test('从 settings 中提取默认店铺版本', () => {
  const view = buildMasterSettingsView({
    reservation_enabled: 1,
    reservation_commission_type: 'percentage',
    reservation_commission_value: 0,
    delivery_enabled: 0,
    delivery_commission_type: 'per_order',
    delivery_commission_value: 5,
    subscription_delivery_commission_type: 'percentage',
    subscription_delivery_commission_value: 3,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 35,
    default_shop_tier: 'business',
  });

  assert.equal(view.defaultShopTier, 'business');
  assert.equal(view.defaultShopTierText, '商务版');
});

test('默认店铺版本为 subscription（非法值）', () => {
  const view = buildMasterSettingsView({
    reservation_enabled: 1,
    reservation_commission_type: 'percentage',
    reservation_commission_value: 0,
    delivery_enabled: 0,
    delivery_commission_type: 'per_order',
    delivery_commission_value: 5,
    subscription_delivery_commission_type: 'percentage',
    subscription_delivery_commission_value: 3,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 35,
    default_shop_tier: 'invalid',
  });

  assert.equal(view.defaultShopTier, 'subscription');
  assert.equal(view.defaultShopTierText, '会员版');
});

test('默认店铺版本默认为 subscription（缺失字段）', () => {
  const view = buildMasterSettingsView({
    reservation_enabled: 1,
    reservation_commission_type: 'percentage',
    reservation_commission_value: 0,
    delivery_enabled: 0,
    delivery_commission_type: 'per_order',
    delivery_commission_value: 5,
    subscription_delivery_commission_type: 'percentage',
    subscription_delivery_commission_value: 3,
    business_delivery_commission_type: 'per_order',
    business_delivery_commission_value: 35,
  });

  assert.equal(view.defaultShopTier, 'subscription');
  assert.equal(view.defaultShopTierText, '会员版');
});

test('缺失设置字段时回退默认值', () => {
  const view = buildMasterSettingsView({});

  assert.equal(view.reservationPlan.enabled, true);
  assert.equal(view.reservationPlan.commissionType, 'percentage');
  assert.equal(view.reservationPlan.commissionValue, 3);
  assert.equal(view.reservationPlan.displayText, '3%');
  assert.equal(view.reservationPlan.source, 'default');
  assert.equal(view.reservationPlan.sourceLabel, '全局默认');
  assert.equal(view.deliveryPlan.enabled, true);
  assert.equal(view.deliveryPlan.commissionType, 'percentage');
  assert.equal(view.deliveryPlan.commissionValue, 5);
  assert.equal(view.deliveryPlan.displayText, '5%');
  assert.equal(view.deliveryPlan.source, 'default');
  assert.equal(view.deliveryPlan.sourceLabel, '全局默认');
  assert.equal(view.subscriptionFeeRsd, 3);
  assert.equal(view.businessFeeRsd, 5);
  assert.equal(view.subscriptionCommissionType, 'percentage');
  assert.equal(view.subscriptionCommissionValue, 3);
  assert.equal(view.businessCommissionType, 'percentage');
  assert.equal(view.businessCommissionValue, 5);
  assert.deepEqual(view.footer, {
    footerText: '',
    footerPhone: '',
    footerCopyright: '',
  });
  assert.deepEqual(view.rate, {
    exchangeRate: 0,
    displayFinalRate: 0,
    rateBase: 0,
    rateOffset: 0,
    rateStep: 0,
  });
  assert.deepEqual(view.wechat, {
    wechatId: '',
    wechatContactQr: '',
    alipayPaymentQr: '',
    wechatPaymentQr: '',
  });
  assert.deepEqual(view.storage, {
    imageStorage: 'local',
    r2PublicDomain: '',
    uploadStrictR2: false,
  });
  assert.deepEqual(view.server, {
    mqttBroker: '',
    telegramWebhookSecret: '',
    telegramChatId: '',
  });
  assert.deepEqual(view.categories, {
    categoriesJson: '[]',
  });
  assert.deepEqual(view.backup, {
    backupTime: '',
    backupRetention: 7,
    backupTarget: '',
    backupHost: '',
    backupUser: '',
    backupPass: '',
    backupPath: '',
    backupEndpoint: '',
    backupBucket: '',
  });
});

test('从 settings 中提取第二波全局设置字段', () => {
  const view = buildMasterSettingsView({
    footer_text: '欢迎下单',
    footer_phone: '+381600000000',
    footer_copyright: 'Serbia 70',
    exchange_rate: 18.2,
    display_final_rate: 19.5,
    rate_base: 17.8,
    rate_offset: 0.6,
    rate_step: 0.1,
    wechat_id: 'serbia70wx',
    wechat_contact_qr: 'https://cdn.example.com/contact.png',
    alipay_payment_qr: 'https://cdn.example.com/alipay.png',
    wechat_payment_qr: 'https://cdn.example.com/wechat-pay.png',
    image_storage: 'r2',
    r2_public_domain: 'https://img.example.com',
    upload_strict_r2: true,
    mqtt_broker: 'mqtt.serbia70.com',
    telegram_webhook_secret: 'secret-123',
    telegram_chat_id: '99887766',
    categories: [{ id: 'hero', name: '推荐' }],
    backup_time: '03:00',
    backup_retention: 14,
    backup_target: 's3',
    backup_host: 'backup-host',
    backup_user: 'backup-user',
    backup_pass: 'backup-pass',
    backup_path: '/srv/backup',
    backup_endpoint: 'https://s3.example.com',
    backup_bucket: 'meituan-backups',
  });

  assert.deepEqual(view.footer, {
    footerText: '欢迎下单',
    footerPhone: '+381600000000',
    footerCopyright: 'Serbia 70',
  });
  assert.deepEqual(view.rate, {
    exchangeRate: 18.2,
    displayFinalRate: 19.5,
    rateBase: 17.8,
    rateOffset: 0.6,
    rateStep: 0.1,
  });
  assert.deepEqual(view.wechat, {
    wechatId: 'serbia70wx',
    wechatContactQr: 'https://cdn.example.com/contact.png',
    alipayPaymentQr: 'https://cdn.example.com/alipay.png',
    wechatPaymentQr: 'https://cdn.example.com/wechat-pay.png',
  });
  assert.deepEqual(view.storage, {
    imageStorage: 'r2',
    r2PublicDomain: 'https://img.example.com',
    uploadStrictR2: true,
  });
  assert.deepEqual(view.server, {
    mqttBroker: 'mqtt.serbia70.com',
    telegramWebhookSecret: 'secret-123',
    telegramChatId: '99887766',
  });
  assert.deepEqual(view.categories, {
    categoriesJson: JSON.stringify([{ id: 'hero', name: '推荐' }], null, 2),
  });
  assert.deepEqual(view.backup, {
    backupTime: '03:00',
    backupRetention: 14,
    backupTarget: 's3',
    backupHost: 'backup-host',
    backupUser: 'backup-user',
    backupPass: 'backup-pass',
    backupPath: '/srv/backup',
    backupEndpoint: 'https://s3.example.com',
    backupBucket: 'meituan-backups',
  });
});
