import { buildMasterSettingsView, type MasterSettingsView } from './master-settings-view.ts';
import { buildMasterShopView, type MasterShopView } from './master-shop-view.ts';
import {
  buildMasterDashboardNotices,
  buildMasterDashboardOverview,
  buildMasterDashboardPageState,
  buildMasterDashboardPanels,
  type MasterDashboardNotice,
  type MasterDashboardPageState,
  type MasterDashboardTab,
} from './master-dashboard-view-helpers.ts';

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
  defaultShopTier?: unknown;
};

export type MasterDashboardBuildInput = {
  shops: MasterDashboardShopInput[];
  settings: MasterDashboardSettingsInput;
  activeTab: MasterDashboardTab;
  isUnauthorized: boolean;
  loadError: string;
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
  actions: Array<
    | { key: 'login'; kind: 'link'; label: string; href: string; className: string }
    | {
        key: 'logout' | 'refresh';
        kind: 'button';
        label: string;
        handler: 'logoutMaster' | 'reloadPage';
        className: string;
      }
  >;
  panels: {
    shopEdit: {
      defaultsFromSettings: boolean;
      defaults: {
        reservationPlan: MasterSettingsView['reservationPlan'];
        deliveryPlan: MasterSettingsView['deliveryPlan'];
        defaultShopTier: MasterSettingsView['defaultShopTier'];
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

export function buildMasterDashboardView(input: MasterDashboardBuildInput): MasterDashboardView {
  const pageState = buildMasterDashboardPageState(input);
  const settings = buildMasterSettingsView(input.settings);
  const shopManagementShops = input.shops.map((shop) =>
    buildMasterShopView(shop, {
      defaults: {
        reservationPlan: settings.reservationPlan,
        deliveryPlan: settings.deliveryPlan,
        defaultShopTier: settings.defaultShopTier,
      },
    }),
  );

  const actions = pageState.kind === 'ready' ? [] : pageState.actions;

  return {
    pageState,
    overview: buildMasterDashboardOverview(input.shops),
    shopManagement: {
      shops: shopManagementShops,
      activeTab: input.activeTab,
    },
    settings,
    notices: buildMasterDashboardNotices(pageState),
    actions,
    panels: buildMasterDashboardPanels(settings),
  };
}
