type MasterShopView = {
  id?: number | string;
  name?: string;
  slug?: string;
  rawStatus?: string;
  enableDelivery?: boolean;
  enableDineIn?: boolean;
  enableReservation?: boolean;
  balanceRsd?: number;
  billingPlanType?: string;
  dineInStatusLabel?: string;
  dineInBillingStartAt?: string;
  dineInExpiresAt?: string;
  dineInGraceUntil?: string;
  shopTier?: {
    effectiveTier?: 'subscription' | 'business';
    source?: 'global' | 'override';
  };
  reservationPlan: {
    enabled: boolean;
    source?: string;
    commissionType?: string;
    commissionValue?: number;
  };
  deliveryPlan: {
    enabled: boolean;
    source?: string;
    commissionType?: string;
    commissionValue?: number;
  };
};

type ShopEditPanelDefaults = {
  defaults?: Record<string, unknown>;
};

type ShopTopupPanelDefaults = {
  openHint?: string;
};

type ShopDineInPanelDefaults = {
  openHint?: string;
};

type BuildMasterShopEditPayload = (
  input: Record<string, unknown>,
  options?: { defaults?: Record<string, unknown> },
) => Record<string, unknown>;

type InitMasterShopPanelsOptions = {
  shopViews: MasterShopView[];
  shopEditPanelDefaults: ShopEditPanelDefaults;
  shopTopupPanelDefaults: ShopTopupPanelDefaults;
  shopDineInPanelDefaults: ShopDineInPanelDefaults;
  buildMasterShopEditPayload: BuildMasterShopEditPayload;
  buildEditShopSuccessMessage: (shopName: string) => string;
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

type SubmitShopPanelActionOptions = {
  submitBtn: HTMLButtonElement;
  feedback: HTMLElement;
  loadingText: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: Record<string, unknown>;
  errorText: string;
  networkErrorText: string;
  onSuccess: () => void;
  onUnauthorized?: () => boolean;
  onError?: () => void;
};

function toDebugErrorMessage(data: unknown, fallback: string, status: number) {
  const errorValue = data && typeof data === 'object' && 'error' in data ? data.error : null;
  if (typeof errorValue === 'string' && errorValue.trim()) {
    return `${errorValue.trim()} (HTTP ${status})`;
  }
  if (data && typeof data === 'object') {
    const serialized = JSON.stringify(data);
    if (serialized && serialized !== '{}') {
      return `${fallback} (HTTP ${status}) ${serialized}`;
    }
  }
  return `${fallback} (HTTP ${status})`;
}

function findMasterShopById(shopViews: MasterShopView[], shopId: unknown) {
  const numericId = Number(shopId || 0);
  return shopViews.find((shop) => Number(shop.id || 0) === numericId) || null;
}

function addYearsToDateOnly(dateOnly: unknown, years: number) {
  const raw = String(dateOnly || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return parsed.toISOString().slice(0, 10);
}

export function initMasterShopPanels({
  shopViews,
  shopEditPanelDefaults,
  shopTopupPanelDefaults,
  shopDineInPanelDefaults,
  buildMasterShopEditPayload,
  buildEditShopSuccessMessage,
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterShopPanelsOptions) {
  async function submitShopPanelAction({
    submitBtn,
    feedback,
    loadingText,
    endpoint,
    method,
    payload,
    errorText,
    networkErrorText,
    onSuccess,
    onUnauthorized,
    onError,
  }: SubmitShopPanelActionOptions) {
    feedback.textContent = loadingText;
    submitBtn.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        if (onUnauthorized?.() === false) return false;
        return false;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        feedback.textContent = toDebugErrorMessage(data, errorText, res.status);
        onError?.();
        return false;
      }

      onSuccess();
      return true;
    } catch {
      feedback.textContent = networkErrorText;
      onError?.();
      return false;
    } finally {
      submitBtn.disabled = false;
    }
  }

  function openShopEditPanel(shopId: unknown) {
    const shop = findMasterShopById(shopViews, shopId);
    const panel = document.getElementById('master-shop-edit-panel');
    const form = document.getElementById('master-shop-edit-form');
    const feedback = document.getElementById('master-shop-edit-feedback');
    if (!(panel instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !shop) return;

    form.elements.id.value = String(shop.id || '');
    form.elements.name.value = shop.name || '';
    form.elements.slug.value = shop.slug || '';
    form.elements.password.value = '';
    form.elements.reservationEnabled.value = shop.reservationPlan.enabled ? '1' : '0';
    form.elements.reservationCommissionType.value = shop.reservationPlan.commissionType || 'percentage';
    form.elements.reservationCommissionValue.value = String(shop.reservationPlan.commissionValue || 0);
    form.elements.deliveryEnabled.value = shop.deliveryPlan.enabled ? '1' : '0';
    form.elements.deliveryCommissionType.value = shop.deliveryPlan.commissionType || 'percentage';
    form.elements.deliveryCommissionValue.value = String(shop.deliveryPlan.commissionValue || 0);
    form.elements.commissionMode.value =
      shop.reservationPlan.source === 'default' && shop.deliveryPlan.source === 'default' ? 'global' : 'override';
    form.elements.status.value = shop.rawStatus || 'active';
    form.elements.enableDineIn.value = shop.enableDineIn ? '1' : '0';
    if (feedback instanceof HTMLElement) feedback.textContent = '保存后建议刷新当前列表确认结果。';
    panel.hidden = false;
  }

  function openShopTopupPanel(shopId: unknown) {
    const shop = findMasterShopById(shopViews, shopId);
    const panel = document.getElementById('master-shop-topup-panel');
    const form = document.getElementById('master-shop-topup-form');
    const feedback = document.getElementById('master-shop-topup-feedback');
    if (!(panel instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !shop) return;

    form.elements.id.value = String(shop.id || '');
    form.elements.shopName.value = shop.name || '';
    form.elements.currentBalance.value = `${Number(shop.balanceRsd || 0).toLocaleString('zh-CN')} RSD`;
    form.elements.amountRsd.value = '';
    form.elements.note.value = '';
    if (feedback instanceof HTMLElement) {
      feedback.textContent = String(shopTopupPanelDefaults.openHint || '充值成功后建议刷新页面确认余额变化。');
    }
    panel.hidden = false;
  }

  function openShopDineInPanel(shopId: unknown) {
    const shop = findMasterShopById(shopViews, shopId);
    const panel = document.getElementById('master-shop-dinein-panel');
    const form = document.getElementById('master-shop-dinein-form');
    const feedback = document.getElementById('master-shop-dinein-feedback');
    if (!(panel instanceof HTMLElement) || !(form instanceof HTMLFormElement) || !shop) return;

    form.elements.shopId.value = String(shop.id || '');
    form.elements.dineInStatusLabel.value = String(shop.dineInStatusLabel || '--');
    form.elements.dineInBillingStartAt.value = String(shop.dineInBillingStartAt || '--');
    form.elements.dineInExpiresAt.value = String(shop.dineInExpiresAt || '--');
    form.elements.dineInGraceUntil.value = String(shop.dineInGraceUntil || '--');
    form.elements.enableDineIn.value = shop.enableDineIn ? '已启用' : '已停用';
    form.elements.shopTierMode.value = shop.shopTier?.source === 'override' ? 'override' : 'global';
    form.elements.shopTierOverride.value = shop.shopTier?.effectiveTier || 'subscription';
    form.elements.shopTierModeSelect.value = form.elements.shopTierMode.value;
    form.elements.shopTierOverrideSelect.value = form.elements.shopTierOverride.value;
    const defaultTierText = panel.querySelector('[data-shop-tier-default-text]');
    if (defaultTierText instanceof HTMLElement) {
      defaultTierText.textContent = String(shopEditPanelDefaults.defaults?.defaultShopTier === 'business' ? '商务版' : '会员版');
    }
    form.elements.expiresAt.value = '';

    if (feedback instanceof HTMLElement) {
      feedback.textContent = String(shopDineInPanelDefaults.openHint || '请选择要执行的堂食订阅操作。');
    }
    panel.hidden = false;
  }

  async function handleShopEdit(form: HTMLFormElement) {
    const feedback = document.getElementById('master-shop-edit-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const formData = new FormData(form);
    const payload = buildMasterShopEditPayload(Object.fromEntries(formData.entries()), {
      defaults: shopEditPanelDefaults.defaults,
    });

    await submitShopPanelAction({
      submitBtn,
      feedback,
      loadingText: '保存中...',
      endpoint: `/api/master/shops/${encodeURIComponent(String(payload.id))}`,
      method: 'PUT',
      payload,
      errorText: '保存失败，请检查后端支持范围',
      networkErrorText: '保存失败，请稍后重试',
      onSuccess: () => {
        const panel = document.getElementById('master-shop-edit-panel');
        if (panel instanceof HTMLElement) panel.hidden = true;
        alert(buildEditShopSuccessMessage(String(payload.name || '')));
        window.location.reload();
      },
    });
  }

  async function handleShopTopup(form: HTMLFormElement) {
    const feedback = document.getElementById('master-shop-topup-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const formData = new FormData(form);
    const payload = {
      id: Number(formData.get('id') || 0),
      amountRsd: Number(formData.get('amountRsd') || 0),
      note: String(formData.get('note') || '').trim(),
    };

    await submitShopPanelAction({
      submitBtn,
      feedback,
      loadingText: '提交中...',
      endpoint: '/api/master/shop-balance',
      method: 'POST',
      payload,
      errorText: '充值失败，请检查后端支持范围',
      networkErrorText: '充值失败，请稍后重试',
      onSuccess: () => {
        feedback.textContent = '充值成功，余额已更新';
        form.reset();
        const panel = document.getElementById('master-shop-topup-panel');
        if (panel instanceof HTMLElement) panel.hidden = true;
        alert('充值成功，页面将刷新以显示最新余额');
        window.location.reload();
      },
    });
  }

  async function submitMasterShopTier(form: HTMLFormElement, submitButton: HTMLButtonElement) {
    const selectedTierMode = String(form.elements.shopTierModeSelect.value || 'global');
    const selectedTierOverride = String(form.elements.shopTierOverrideSelect.value || 'subscription');
    form.elements.shopTierMode.value = selectedTierOverride === 'business' ? 'override' : selectedTierMode;
    form.elements.shopTierOverride.value = selectedTierOverride;
    const feedback = document.getElementById('master-shop-dinein-feedback');
    const submitBtn = submitButton instanceof HTMLButtonElement ? submitButton : null;
    if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement) || !submitBtn) return false;

    const formData = new FormData(form);
    const shopId = Number(formData.get('shopId') || 0);
    if (!shopId) {
      feedback.textContent = '缺少店铺参数';
      return false;
    }

    const shop = findMasterShopById(shopViews, shopId);
    if (!shop) {
      feedback.textContent = '店铺不存在';
      return false;
    }

    const payload = buildMasterShopEditPayload({
      id: shopId,
      name: shop.name || '',
      slug: shop.slug || '',
      password: '',
      status: shop.rawStatus || 'active',
      enableDelivery: shop.enableDelivery ? '1' : '0',
      enableDineIn: shop.enableDineIn ? '1' : '0',
      enableReservation: shop.enableReservation ? '1' : '0',
      reservationEnabled: shop.reservationPlan.enabled ? '1' : '0',
      reservationCommissionType: shop.reservationPlan.commissionType || 'percentage',
      reservationCommissionValue: String(shop.reservationPlan.commissionValue || 0),
      deliveryEnabled: shop.deliveryPlan.enabled ? '1' : '0',
      deliveryCommissionType: shop.deliveryPlan.commissionType || 'percentage',
      deliveryCommissionValue: String(shop.deliveryPlan.commissionValue || 0),
      commissionMode:
        shop.reservationPlan.source === 'default' && shop.deliveryPlan.source === 'default' ? 'global' : 'override',
      shopTierMode: form.elements.shopTierMode.value,
      shopTierOverride: form.elements.shopTierOverride.value,
    }, {
      defaults: shopEditPanelDefaults.defaults,
    });
    const selectedTier = String(payload.billing_plan_type || payload.billingPlanType || 'subscription');
    payload.subscription_enabled = selectedTier === 'subscription' ? 1 : 0;
    payload.business_enabled = selectedTier === 'business' ? 1 : 0;

    await submitShopPanelAction({
      submitBtn,
      feedback,
      loadingText: '保存版本中...',
      endpoint: `/api/master/shops/${encodeURIComponent(String(shopId))}`,
      method: 'PUT',
      payload,
      errorText: '保存版本失败',
      networkErrorText: '保存版本失败，请稍后重试',
      onSuccess: () => {
        feedback.textContent = '版本设置已保存，页面将刷新';
        window.location.reload();
      },
    });

    return false;
  }

  async function submitMasterShopDineIn(form: HTMLFormElement, action: string, submitButton: HTMLButtonElement) {
    form.elements.shopTierMode.value = String(form.elements.shopTierModeSelect.value || 'global');
    form.elements.shopTierOverride.value = String(form.elements.shopTierOverrideSelect.value || 'subscription');
    const feedback = document.getElementById('master-shop-dinein-feedback');
    const submitBtn = submitButton instanceof HTMLButtonElement ? submitButton : null;
    if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement) || !submitBtn) return false;

    const formData = new FormData(form);
    const payload = {
      shopId: Number(formData.get('shopId') || 0),
      action: String(action || '').trim(),
      expiresAt: String(formData.get('expiresAt') || '').trim(),
    };

    if (!payload.shopId || !payload.action) {
      feedback.textContent = '缺少店铺或操作参数';
      return false;
    }
    if (payload.action === 'set_expiry' && !payload.expiresAt) {
      feedback.textContent = '请先选择到期日期';
      return false;
    }

    const shop = findMasterShopById(shopViews, payload.shopId);
    if (!shop) {
      feedback.textContent = '店铺不存在';
      return false;
    }

    const currentExpireDate = String(shop.dineInExpiresAt || '').trim() || addYearsToDateOnly(shop.dineInBillingStartAt || '', 1);
    const expireDate =
      payload.action === 'set_expiry'
        ? payload.expiresAt
        : payload.action === 'extend_one_year'
          ? addYearsToDateOnly(currentExpireDate, 1)
          : currentExpireDate;
    const updatePayload = buildMasterShopEditPayload({
      id: payload.shopId,
      name: shop.name || '',
      slug: shop.slug || '',
      password: '',
      status: shop.rawStatus || 'active',
      enableDelivery: shop.enableDelivery ? '1' : '0',
      enableDineIn: payload.action === 'manual_stop' ? '0' : '1',
      enableReservation: shop.enableReservation ? '1' : '0',
      reservationEnabled: shop.reservationPlan.enabled ? '1' : '0',
      reservationCommissionType: shop.reservationPlan.commissionType || 'percentage',
      reservationCommissionValue: String(shop.reservationPlan.commissionValue || 0),
      deliveryEnabled: shop.deliveryPlan.enabled ? '1' : '0',
      deliveryCommissionType: shop.deliveryPlan.commissionType || 'percentage',
      deliveryCommissionValue: String(shop.deliveryPlan.commissionValue || 0),
      commissionMode:
        shop.reservationPlan.source === 'default' && shop.deliveryPlan.source === 'default' ? 'global' : 'override',
    }, {
      defaults: shopEditPanelDefaults.defaults,
    });
    const renewPayload = {
      ...updatePayload,
      shopId: payload.shopId,
      action: payload.action,
      expiresAt: expireDate,
      expireDate,
      expire_date: expireDate,
      dine_in_expires_at: expireDate,
    };
    const originalText = submitBtn.textContent || '提交';

    await submitShopPanelAction({
      submitBtn,
      feedback,
      loadingText: '提交中...',
      endpoint: `/api/master/shops/${encodeURIComponent(String(payload.shopId))}`,
      method: 'PUT',
      payload: renewPayload,
      errorText: '堂食订阅操作失败',
      networkErrorText: '堂食订阅操作失败，请稍后重试',
      onSuccess: () => {
        const panel = document.getElementById('master-shop-dinein-panel');
        if (panel instanceof HTMLElement) panel.hidden = true;
        alert('堂食订阅操作成功，页面将刷新');
        window.location.reload();
      },
      onUnauthorized: () => {
        submitBtn.textContent = originalText;
        return false;
      },
      onError: () => {
        submitBtn.textContent = originalText;
      },
    });

    return false;
  }

  function handleDocumentClick(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest('[data-close-shop-edit]')) {
      const panel = document.getElementById('master-shop-edit-panel');
      if (panel instanceof HTMLElement) panel.hidden = true;
    }

    if (target.closest('[data-close-shop-topup]')) {
      const panel = document.getElementById('master-shop-topup-panel');
      if (panel instanceof HTMLElement) panel.hidden = true;
    }

    if (target.closest('[data-close-shop-dinein]')) {
      const panel = document.getElementById('master-shop-dinein-panel');
      if (panel instanceof HTMLElement) panel.hidden = true;
    }
  }

  return {
    openMasterShopEdit(shopId: unknown) {
      if (shopId) openShopEditPanel(shopId);
    },
    openMasterShopTopup(shopId: unknown) {
      if (shopId) openShopTopupPanel(shopId);
    },
    openMasterShopDineIn(shopId: unknown) {
      if (shopId) openShopDineInPanel(shopId);
    },
    handleDocumentClick,
    submitMasterShopEdit(form: HTMLFormElement) {
      void handleShopEdit(form);
      return false;
    },
    submitMasterShopTopup(form: HTMLFormElement) {
      void handleShopTopup(form);
      return false;
    },
    submitMasterShopDineIn,
    submitMasterShopTier,
  };
}
