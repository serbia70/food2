import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMasterDashboardView,
  type MasterDashboardBuildInput,
  type MasterDashboardTab,
} from './master-dashboard-view.ts';

test('buildMasterDashboardView aggregates overview and typed child views in ready state', () => {
  const view = buildMasterDashboardView({
    shops: [
      {
        id: 1,
        name: 'A 店',
        slug: 'a',
        today_revenue: 100,
        today_order_count: 2,
        billing_balance_rsd: 30,
      },
      {
        id: 2,
        name: 'B 店',
        slug: 'b',
        today_revenue: 250,
        today_order_count: 5,
        billing_balance_rsd: 70,
      },
    ],
    settings: {},
    activeTab: 'shops',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal(view.pageState.kind, 'ready');
  assert.equal(view.overview.todayRevenue, 350);
  assert.equal(view.overview.todayOrders, 7);
  assert.equal(view.overview.totalBalance, 100);
  assert.equal(view.shopManagement.activeTab, 'shops');
  assert.ok(Array.isArray(view.shopManagement.shops));
  assert.equal('today_revenue' in view.shopManagement.shops[0], false);
  assert.equal(view.shopManagement.shops[0].todayRevenue, 100);
});

test('buildMasterDashboardView returns unauthorized page state with actions', () => {
  const view = buildMasterDashboardView({
    shops: [],
    settings: {},
    activeTab: 'overview',
    isUnauthorized: true,
    loadError: '加载失败 (401)',
  });

  assert.equal(view.pageState.kind, 'unauthorized');
  assert.deepEqual(
    new Set(view.pageState.actions.map((item) => item.key)),
    new Set(['login', 'logout', 'refresh']),
  );

  const actionByKey = new Map(view.pageState.actions.map((item) => [item.key, item]));
  assert.equal(actionByKey.get('login')?.kind, 'link');
  assert.equal(actionByKey.get('logout')?.kind, 'button');
  assert.equal(actionByKey.get('logout')?.handler, 'logoutMaster');
  assert.equal(actionByKey.get('refresh')?.kind, 'button');
  assert.equal(actionByKey.get('refresh')?.handler, 'reloadPage');
});

test('buildMasterDashboardView returns load_error page state with error notice and actions', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 1, name: 'A 店', slug: 'a' }],
    settings: {},
    activeTab: 'overview',
    isUnauthorized: false,
    loadError: '后端超时',
  });

  assert.equal(view.pageState.kind, 'load_error');
  assert.equal(view.pageState.message, '后端超时');
  assert.deepEqual(
    new Set(view.pageState.actions.map((item) => item.key)),
    new Set(['login', 'logout', 'refresh']),
  );
  assert.deepEqual(view.notices, [{ kind: 'error', message: '后端超时' }]);
  assert.deepEqual(view.actions, view.pageState.actions);
});

test('buildMasterDashboardView exposes typed child models instead of raw shop/settings payloads', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 9, name: 'Typed Shop', slug: 'typed-shop' }],
    settings: { mqtt_broker: 'mqtt.example.com' },
    activeTab: 'settings',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal('today_revenue' in view.shopManagement.shops[0], false);
  assert.equal('mqtt_broker' in view.settings, false);
  assert.equal(view.settings.server.mqttBroker, 'mqtt.example.com');
});

test('buildMasterDashboardView passes settings fee defaults into shop fallback plans', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 10, name: 'Fallback Shop', slug: 'fallback-shop' }],
    settings: {
      reservation_enabled: 0,
      reservation_commission_type: 'per_order',
      reservation_commission_value: 11,
      delivery_enabled: 1,
      delivery_commission_type: 'percentage',
      delivery_commission_value: 7,
    },
    activeTab: 'shops',
    isUnauthorized: false,
    loadError: '',
  });

  const [shop] = view.shopManagement.shops;
  assert.equal(shop.reservationPlan.enabled, false);
  assert.equal(shop.reservationPlan.commissionType, 'per_order');
  assert.equal(shop.reservationPlan.commissionValue, 11);
  assert.equal(shop.reservationPlan.source, 'default');
  assert.equal(shop.deliveryPlan.enabled, true);
  assert.equal(shop.deliveryPlan.commissionType, 'percentage');
  assert.equal(shop.deliveryPlan.commissionValue, 7);
  assert.equal(shop.deliveryPlan.source, 'default');
  assert.deepEqual(view.panels.shopEdit.resetDefaults, {
    reservationCommissionType: 'per_order',
    reservationCommissionValue: 11,
    deliveryCommissionType: 'percentage',
    deliveryCommissionValue: 7,
  });
  assert.equal(view.panels.shopEdit.defaults.defaultShopTier, 'subscription');
});

test('buildMasterDashboardView passes default shop tier into shop edit panel defaults', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 20, name: 'Tier Shop', slug: 'tier-shop' }],
    settings: {
      defaultShopTier: 'business',
    },
    activeTab: 'shops',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal(view.shopManagement.shops[0].shopTier.effectiveTier, 'business');
  assert.equal(view.panels.shopEdit.defaults.defaultShopTier, 'business');
});

test('buildMasterDashboardView should use normalized snake_case default shop tier for shop views', () => {
  const view = buildMasterDashboardView({
    shops: [{ id: 21, name: 'Snake Tier Shop', slug: 'snake-tier-shop', shop_tier_mode: 'global' }],
    settings: {
      default_shop_tier: 'business',
    },
    activeTab: 'shops',
    isUnauthorized: false,
    loadError: '',
  });

  assert.equal(view.settings.defaultShopTier, 'business');
  assert.equal(view.shopManagement.shops[0].shopTier.effectiveTier, 'business');
  assert.equal(view.panels.shopEdit.defaults.defaultShopTier, 'business');
});

test('buildMasterDashboardView keeps activeTab strictly within legal tab union inputs', () => {
  const legalTabs = ['overview', 'shops', 'settings', 'backup'] as const satisfies readonly MasterDashboardTab[];
  const commonInput = {
    shops: [],
    settings: {},
    isUnauthorized: false,
    loadError: '',
  } satisfies Omit<MasterDashboardBuildInput, 'activeTab'>;

  for (const tab of legalTabs) {
    const view = buildMasterDashboardView({
      ...commonInput,
      activeTab: tab,
    });
    assert.equal(view.shopManagement.activeTab, tab);
  }
});
