import { type OrderChannelFeePlan } from './order-channel-fees-view.ts';
import {
  buildDeliveryPlan,
  buildReservationPlan,
  resolveDefaultShopTier,
  toStringValue,
} from './master-settings-normalizers.ts';
import {
  buildBackupSettings,
  buildCategorySettings,
  buildFooterSettings,
  buildRateSettings,
  buildServerSettings,
  buildStorageSettings,
  buildWechatSettings,
} from './master-settings-view-sections.ts';

type MasterSettingsInput = Record<string, unknown>;

export type MasterSettingsView = {
  reservationPlan: OrderChannelFeePlan;
  deliveryPlan: OrderChannelFeePlan;
  shopDefaults: {
    city: string;
    hours: {
      open: string;
      close: string;
    };
  };
  subscriptionFeeRsd: number;
  businessFeeRsd: number;
  subscriptionCommissionType: string;
  subscriptionCommissionValue: number;
  businessCommissionType: string;
  businessCommissionValue: number;
  defaultShopTier: 'subscription' | 'business';
  defaultShopTierText: '会员版' | '商务版';
  footer: {
    footerText: string;
    footerPhone: string;
    footerCopyright: string;
  };
  rate: {
    exchangeRate: number;
    displayFinalRate: number;
    rateBase: number;
    rateOffset: number;
    rateStep: number;
  };
  wechat: {
    wechatId: string;
    wechatContactQr: string;
    alipayPaymentQr: string;
    wechatPaymentQr: string;
  };
  storage: {
    imageStorage: string;
    r2PublicDomain: string;
    uploadStrictR2: boolean;
  };
  server: {
    mqttBroker: string;
    telegramWebhookSecret: string;
    telegramChatId: string;
    telegramBotToken: string;
  };
  categories: {
    categoriesJson: string;
  };
  backup: {
    backupTime: string;
    backupRetention: number;
    backupTarget: string;
    backupHost: string;
    backupUser: string;
    backupPass: string;
    backupPath: string;
    backupEndpoint: string;
    backupBucket: string;
  };
};

export function buildMasterSettingsView(settings: MasterSettingsInput): MasterSettingsView {
  const reservationPlan = buildReservationPlan(settings);
  const deliveryPlan = buildDeliveryPlan(settings);

  const defaultShopTier = resolveDefaultShopTier(settings);

  return {
    reservationPlan,
    deliveryPlan,
    subscriptionFeeRsd: reservationPlan.commissionValue,
    businessFeeRsd: deliveryPlan.commissionValue,
    shopDefaults: {
      city: toStringValue((settings?.shopDefaults as Record<string, unknown> | undefined)?.city),
      hours: {
        open: toStringValue(
          ((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.open,
        ),
        close: toStringValue(
          ((settings?.shopDefaults as Record<string, unknown> | undefined)?.hours as Record<string, unknown> | undefined)?.close,
        ),
      },
    },
    subscriptionCommissionType: reservationPlan.commissionType,
    subscriptionCommissionValue: reservationPlan.commissionValue,
    businessCommissionType: deliveryPlan.commissionType,
    businessCommissionValue: deliveryPlan.commissionValue,
    defaultShopTier,
    defaultShopTierText: defaultShopTier === 'subscription' ? '会员版' : '商务版',
    footer: buildFooterSettings(settings),
    rate: buildRateSettings(settings),
    wechat: buildWechatSettings(settings),
    storage: buildStorageSettings(settings),
    server: buildServerSettings(settings),
    categories: buildCategorySettings(settings),
    backup: buildBackupSettings(settings),
  };
}
