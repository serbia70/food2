import { buildTableLookupKeys, createBelgradeFormatter, escapeHtml } from './table-utils';
import { createTableActions } from './table-actions';
import { createTableDetails } from './table-details';

type TablePageConfig = {
  slug: string;
  endedStatusList?: string[];
  belgradeTimeOptions?: Intl.DateTimeFormatOptions;
};

export function initTablePage(config: TablePageConfig) {
  if (typeof window === 'undefined') return;

  const shopSlug = String(config?.slug || '');
  const endedStatusList = Array.isArray(config?.endedStatusList) ? config.endedStatusList : [];
  const endedStatusSet = new Set(
    endedStatusList
      .map((status) => String(status || '').toLowerCase())
      .filter((status) => status !== ''),
  );
  const belgradeTimeOptions = config?.belgradeTimeOptions || {};
  const fmt = createBelgradeFormatter(belgradeTimeOptions);

  const tableDetails = createTableDetails({
    shopSlug,
    endedOrderStatusList: Array.from(endedStatusSet),
    belgradeTimeOptions,
    buildTableLookupKeys,
    createBelgradeFormatter: () => fmt,
    escapeHtml,
  });

  const navActions = createTableActions({ slug: shopSlug });

  const w = window as typeof window & {
    closeTableDetailsModal?: typeof tableDetails.closeTableDetailsModal;
    openTableDetails?: typeof tableDetails.openTableDetails;
    goToDeliveryMode?: typeof navActions.goToDeliveryMode;
    openReservationModal?: typeof navActions.openReservationModal;
    openTableOrder?: typeof navActions.openTableOrder;
    openTableAdd?: typeof navActions.openTableAdd;
  };

  w.closeTableDetailsModal = tableDetails.closeTableDetailsModal;
  w.openTableDetails = tableDetails.openTableDetails;
  w.goToDeliveryMode = navActions.goToDeliveryMode;
  w.openReservationModal = navActions.openReservationModal;
  w.openTableOrder = navActions.openTableOrder;
  w.openTableAdd = navActions.openTableAdd;
}
