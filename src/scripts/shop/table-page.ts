import { createTableActions } from './table-actions';
import { createTableDetails } from './table-details';
import { buildTableLookupKeys, createBelgradeFormatter, escapeHtml } from './table-utils';

type TablePageConfig = {
  slug: string;
  endedStatusList?: string[];
  belgradeTimeOptions?: Intl.DateTimeFormatOptions;
};

export const initTablePage = (config: TablePageConfig) => {
  if (typeof window === 'undefined') return;

  const { slug, endedStatusList, belgradeTimeOptions } = config;
  const fmt = createBelgradeFormatter(belgradeTimeOptions || {});
  const normalizedEnded = new Set(
    (endedStatusList || [])
      .map((status) => String(status || '').toLowerCase())
      .filter((status) => status),
  );

  const tableDetails = createTableDetails({
    shopSlug: String(slug || ''),
    buildTableLookupKeys,
    escapeHtml,
    endedOrderStatusList: Array.from(normalizedEnded),
    belgradeTimeOptions: fmt.resolvedOptions(),
    debug: false,
  });

  const navActions = createTableActions({ slug: String(slug || '') });

  window.closeTableDetailsModal = tableDetails.closeTableDetailsModal;
  window.openTableDetails = tableDetails.openTableDetails;
  window.goToDeliveryMode = navActions.goToDeliveryMode;
  window.openReservationModal = navActions.openReservationModal;
  window.openTableOrder = navActions.openTableOrder;
  window.openTableAdd = navActions.openTableAdd;
};
