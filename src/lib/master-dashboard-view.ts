import { buildMasterSettingsView, type MasterSettingsView } from './master-settings-view.ts';
import { buildMasterShopView, type MasterShopView } from './master-shop-view.ts';

type MasterDashboardShopInput = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  today_revenue?: unknown;
  today_order_count?: unknown;
  commission_month_rsd?: unknown;
  billing_balance_rsd?: unknown;
  reservation_enabled?: unknown;
  reservation_commission_type?: unknown;
  reservation_commission_value?: unknown;
  delivery_enabled?: unknown;
  delivery_commission_type?: unknown;
  delivery_commission_value?: unknown;
};

type MasterDashboardSettingsInput = {
  reservation_enabled?: unknown;
  reservation_commission_type?: unknown;
  reservation_commission_value?: unknown;
  subscription_enabled?: unknown;
  subscription_delivery_commission_type?: unknown;
  subscription_delivery_commission_value?: unknown;
  delivery_enabled?: unknown;
  delivery_commission_type?: unknown;
  delivery_commission_value?: unknown;
  business_enabled?: unknown;
  business_delivery_commission_type?: unknown;
  business_delivery_commission_value?: unknown;
  mqtt_broker?: unknown;
};

export type MasterDashboardTab = 'overview' | 'shops' | 'settings' | 'backup';

export type MasterDashboardBuildInput = {
  shops: MasterDashboardShopInput[];
  settings: MasterDashboardSettingsInput;
  activeTab: MasterDashboardTab;
  isUnauthorized: boolean;
  loadError: string;
};

export type MasterDashboardAction =
  | { key: 'login'; kind: 'link'; label: string; href: string; className: string }
  | {
      key: 'logout' | 'refresh';
      kind: 'button';
      label: string;
      handler: 'logoutMaster' | 'reloadPage';
      className: string;
    };

export type MasterDashboardPageState =
  | { kind: 'ready' }
  | { kind: 'unauthorized'; message: string; actions: MasterDashboardAction[] }
  | { kind: 'load_error'; message: string; actions: MasterDashboardAction[] };

export type MasterDashboardNotice = {
  kind: 'info' | 'warning' | 'error';
  message: string;
};

export type MasterDashboardView = {
  pageState: MasterDashboardPageState;
  overview: {
    totalShops: number;
    todayRevenue: number;
    todayOrders: number;
    monthCommission: number;
    totalBalance: number;
  };
  shopManagement: {
    shops: MasterShopView[];
    activeTab: MasterDashboardTab;
  };
  settings: MasterSettingsView;
  notices: MasterDashboardNotice[];
  actions: MasterDashboardAction[];
  panels: {
    shopEdit: {
      defaultsFromSettings: boolean;
      defaults: {
        reservationPlan: MasterSettingsView['reservationPlan'];
        deliveryPlan: MasterSettingsView['deliveryPlan'];
      };
      resetDefaults: {
        reservationCommissionType: string;
        reservationCommissionValue: number;
        deliveryCommissionType: string;
        deliveryCommissionValue: number;
      };
    };
    shopTopup: {
      openHint: string;
    };
    shopDineIn: {
      openHint: string;
    };
  };
};

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function buildOverview(shops: MasterDashboardShopInput[]): MasterDashboardView['overview'] {
  return shops.reduce(
    (acc, shop) => {
      acc.totalShops += 1;
      acc.todayRevenue += toNumber(shop.today_revenue);
      acc.todayOrders += toNumber(shop.today_order_count);
      acc.monthCommission += toNumber(shop.commission_month_rsd);
      acc.totalBalance += toNumber(shop.billing_balance_rsd);
      return acc;
    },
    {
      totalShops: 0,
      todayRevenue: 0,
      todayOrders: 0,
      monthCommission: 0,
      totalBalance: 0,
    },
  );
}

const LOGIN_ACTION: MasterDashboardAction = {
  key: 'login',
  kind: 'link',
  label: '去登录',
  href: '/master/login',
  className: 'primary-btn',
};

const LOGOUT_ACTION: MasterDashboardAction = {
  key: 'logout',
  kind: 'button',
  label: '退出',
  handler: 'logoutMaster',
  className: 'ghost-btn',
};

const REFRESH_ACTION: MasterDashboardAction = {
  key: 'refresh',
  kind: 'button',
  label: '刷新页面',
  handler: 'reloadPage',
  className: 'ghost-btn',
};

function buildErrorActions(): MasterDashboardAction[] {
  return [LOGIN_ACTION, LOGOUT_ACTION, REFRESH_ACTION];
}

function buildPageState(input: MasterDashboardBuildInput): MasterDashboardPageState {
  if (input.isUnauthorized) {
    return {
      kind: 'unauthorized',
      message: input.loadError || '未授权，请重新登录',
      actions: buildErrorActions(),
    };
  }

  if (input.loadError) {
    return {
      kind: 'load_error',
      message: input.loadError,
      actions: buildErrorActions(),
    };
  }

  return { kind: 'ready' };
}

function buildNotices(pageState: MasterDashboardPageState): MasterDashboardNotice[] {
  if (pageState.kind === 'ready') return [];
  return [{ kind: pageState.kind === 'unauthorized' ? 'warning' : 'error', message: pageState.message }];
}

export function buildMasterDashboardView(input: MasterDashboardBuildInput): MasterDashboardView {
  const pageState = buildPageState(input);
  const settings = buildMasterSettingsView(input.settings);
  const shopManagementShops = input.shops.map((shop) =>
    buildMasterShopView(shop, {
      defaults: {
        reservationPlan: settings.reservationPlan,
        deliveryPlan: settings.deliveryPlan,
      },
    }),
  );

  const actions = pageState.kind === 'ready' ? [] : pageState.actions;

  return {
    pageState,
    overview: buildOverview(input.shops),
    shopManagement: {
      shops: shopManagementShops,
      activeTab: input.activeTab,
    },
    settings,
    notices: buildNotices(pageState),
    actions,
    panels: {
      shopEdit: {
        defaultsFromSettings: true,
        defaults: {
          reservationPlan: settings.reservationPlan,
          deliveryPlan: settings.deliveryPlan,
        },
        resetDefaults: {
          reservationCommissionType: settings.reservationPlan.commissionType,
          reservationCommissionValue: settings.reservationPlan.commissionValue,
          deliveryCommissionType: settings.deliveryPlan.commissionType,
          deliveryCommissionValue: settings.deliveryPlan.commissionValue,
        },
      },
      shopTopup: {
        openHint: '充值成功后建议刷新页面确认余额变化。',
      },
      shopDineIn: {
        openHint: '请选择要执行的堂食订阅操作。',
      },
    },
  };
}
