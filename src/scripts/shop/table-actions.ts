import { SHOP_EVENTS } from '../../lib/events.ts';

type TableActionsOptions = {
  slug: string | null | undefined;
};

type TableActions = {
  goToDeliveryMode: () => void;
  openReservationModal: () => void;
  openTableOrder: (tableValue: string) => void;
  openTableAdd: (tableValue: string) => void;
};

export const createTableActions = ({ slug }: TableActionsOptions): TableActions => {
  const shopSlug = String(slug || '');

  const goToDeliveryMode = () => {
    window.location.href = `/${shopSlug}`;
  };

  const openReservationModal = () => {
    window.dispatchEvent(new Event(SHOP_EVENTS.OPEN_RESERVATION));
  };

  const openTableOrder = (tableValue: string) => {
    window.location.href = `/${shopSlug}?table=${encodeURIComponent(tableValue)}&op=new&_t=${Date.now()}`;
  };

  const openTableAdd = (tableValue: string) => {
    window.location.href = `/${shopSlug}?table=${encodeURIComponent(tableValue)}&op=add&_t=${Date.now()}`;
  };

  return { goToDeliveryMode, openReservationModal, openTableOrder, openTableAdd };
};
