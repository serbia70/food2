type InitMasterRuntimeActionsOptions = {
  resetMasterShopFeeOverrides: (
    current: {
      reservationEnabled: boolean;
      reservationCommissionType: string;
      reservationCommissionValue: number;
      deliveryEnabled: boolean;
      deliveryCommissionType: string;
      deliveryCommissionValue: number;
    },
    defaults: {
      reservationCommissionType: string;
      reservationCommissionValue: number;
      deliveryCommissionType: string;
      deliveryCommissionValue: number;
    },
  ) => {
    reservationCommissionType: string;
    reservationCommissionValue: number;
    deliveryCommissionType: string;
    deliveryCommissionValue: number;
  };
  masterShopFeeFallbacks: {
    reservationCommissionType: string;
    reservationCommissionValue: number;
    deliveryCommissionType: string;
    deliveryCommissionValue: number;
  };
  shopEditPanelDefaults: Record<string, unknown>;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterRuntimeActions({
  resetMasterShopFeeOverrides,
  masterShopFeeFallbacks,
  shopEditPanelDefaults,
  handleMasterUnauthorized,
}: InitMasterRuntimeActionsOptions) {
  function resetMasterShopFeeDefaults(form: HTMLFormElement) {
    const formData = new FormData(form);
    const current = {
      reservationEnabled: String(formData.get('reservationEnabled') || '1') === '1',
      reservationCommissionType: String(formData.get('reservationCommissionType') || 'percentage'),
      reservationCommissionValue: Number(formData.get('reservationCommissionValue') || 0),
      deliveryEnabled: String(formData.get('deliveryEnabled') || '1') === '1',
      deliveryCommissionType: String(formData.get('deliveryCommissionType') || 'percentage'),
      deliveryCommissionValue: Number(formData.get('deliveryCommissionValue') || 0),
    };
    const resetDefaults =
      shopEditPanelDefaults && typeof shopEditPanelDefaults === 'object' && 'resetDefaults' in shopEditPanelDefaults
        ? (shopEditPanelDefaults.resetDefaults as Record<string, unknown>)
        : {};
    const next = resetMasterShopFeeOverrides(current, {
      reservationCommissionType: String(
        resetDefaults.reservationCommissionType || masterShopFeeFallbacks.reservationCommissionType,
      ),
      reservationCommissionValue: Number(
        resetDefaults.reservationCommissionValue === undefined
          ? masterShopFeeFallbacks.reservationCommissionValue
          : resetDefaults.reservationCommissionValue,
      ),
      deliveryCommissionType: String(
        resetDefaults.deliveryCommissionType || masterShopFeeFallbacks.deliveryCommissionType,
      ),
      deliveryCommissionValue: Number(
        resetDefaults.deliveryCommissionValue === undefined
          ? masterShopFeeFallbacks.deliveryCommissionValue
          : resetDefaults.deliveryCommissionValue,
      ),
    });

    form.elements.commissionMode.value = 'global';
    form.elements.reservationCommissionType.value = next.reservationCommissionType;
    form.elements.reservationCommissionValue.value = String(next.reservationCommissionValue);
    form.elements.deliveryCommissionType.value = next.deliveryCommissionType;
    form.elements.deliveryCommissionValue.value = String(next.deliveryCommissionValue);
    return false;
  }

  function reloadPage() {
    window.location.reload();
  }

  function logoutMaster() {
    return handleMasterUnauthorized();
  }

  return {
    resetMasterShopFeeDefaults(form: HTMLFormElement) {
      if (!(form instanceof HTMLFormElement)) return false;
      return resetMasterShopFeeDefaults(form);
    },
    reloadPage,
    logoutMaster,
  };
}
