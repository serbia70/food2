type TableActionsOptions = {
  slug: string;
};

export const createTableActions = ({ slug }: TableActionsOptions) => {
  const shopSlug = String(slug || '');

  function goToDeliveryMode() {
    window.location.href = `/${shopSlug}`;
  }

  function openReservationModal() {
    window.dispatchEvent(new Event('open-reservation'));
  }

  function openTableOrder(tableValue: string) {
    window.location.href = `/${shopSlug}?table=${encodeURIComponent(tableValue)}&op=new&_t=${Date.now()}`;
  }

  function openTableAdd(tableValue: string) {
    window.location.href = `/${shopSlug}?table=${encodeURIComponent(tableValue)}&op=add&_t=${Date.now()}`;
  }

  return {
    goToDeliveryMode,
    openReservationModal,
    openTableOrder,
    openTableAdd,
  };
};
