type MasterDispatchGuardSet = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

type MasterDispatchShopAdminBindings = {
  impersonateMasterShop: (shopId: unknown) => void;
};

type MasterDispatchRuntimeBindings = {
  reloadPage: () => void;
};

type InitMasterDispatchActionsOptions = MasterDispatchGuardSet & {
  shopAdminBindings: MasterDispatchShopAdminBindings;
  runtimeActionBindings: MasterDispatchRuntimeBindings;
};

function getDispatchActionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const actionTarget = target.closest('[data-master-dispatch-action]');
  return actionTarget instanceof HTMLButtonElement ? actionTarget : null;
}

export function initMasterDispatchActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
  shopAdminBindings,
  runtimeActionBindings,
}: InitMasterDispatchActionsOptions) {
  async function ensureMasterDispatchShopContext(shopId: unknown) {
    const normalizedShopId = Number(shopId || 0);
    if (!normalizedShopId) {
      throw new Error('缺少店铺信息');
    }

    const impersonateRes = await fetch('/api/master/impersonate-shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: normalizedShopId }),
    });
    const impersonateData = await impersonateRes.json().catch(() => ({}));
    if (isUnauthorizedResponse(impersonateRes, impersonateData)) {
      await handleMasterUnauthorized();
      return false;
    }
    if (!impersonateRes.ok || impersonateData?.ok !== true) {
      const errorMessage = impersonateData && typeof impersonateData === 'object' && 'error' in impersonateData
        ? (impersonateData.error as { message?: unknown })?.message
        : undefined;
      throw new Error(typeof errorMessage === 'string' && errorMessage ? errorMessage : '进入店铺后台失败');
    }
    return true;
  }

  async function masterDispatchRepublish(orderId: unknown, shopId: unknown) {
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedShopId = Number(shopId || 0);
    if (!normalizedOrderId || !normalizedShopId) {
      alert('缺少订单或店铺信息');
      return;
    }

    try {
      const ready = await ensureMasterDispatchShopContext(normalizedShopId);
      if (!ready) return;

      const dispatchRes = await fetch('/api/admin/rider-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: normalizedOrderId,
          action: 'remind',
          rider_remind_count: 0,
        }),
      });
      const dispatchData = await dispatchRes.json().catch(() => ({}));
      if (!dispatchRes.ok || dispatchData?.success === false) {
        throw new Error(String(dispatchData?.error || '再次催单失败'));
      }

      alert('已再次催单');
      runtimeActionBindings.reloadPage();
    } catch (error) {
      alert(error instanceof Error ? error.message : '再次催单失败');
    }
  }

  async function masterDispatchAssignRider(orderId: unknown, shopId: unknown) {
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedShopId = Number(shopId || 0);
    if (!normalizedOrderId || !normalizedShopId) {
      alert('缺少订单或店铺信息');
      return;
    }

    try {
      const ready = await ensureMasterDispatchShopContext(normalizedShopId);
      if (!ready) return;

      const ridersRes = await fetch('/api/rider/status?action=list_available');
      const ridersData = await ridersRes.json().catch(() => ({}));
      const riders = Array.isArray(ridersData?.riders) ? ridersData.riders : [];
      if (!ridersRes.ok || ridersData?.success === false) {
        throw new Error(String(ridersData?.error || '加载骑手失败'));
      }
      if (riders.length === 0) {
        throw new Error('当前无可接单骑手');
      }

      const lines = riders.map((rider, idx) => `${idx + 1}. ${String(rider?.name || '未命名骑手')} (${String(rider?.phone || '-')})`);
      const selected = prompt(`选择要指派的骑手：\n${lines.join('\n')}\n\n请输入序号`);
      if (!selected) return;
      const target = riders[Number(selected) - 1];
      if (!target) {
        throw new Error('序号无效');
      }

      const updateRes = await fetch(`/api/admin/orders/${encodeURIComponent(normalizedOrderId)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'delivering',
          courier_name: String(target?.name || '').trim(),
          courier_phone: String(target?.phone || '').trim(),
        }),
      });
      const updateData = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok || updateData?.success === false) {
        throw new Error(String(updateData?.error || '指派骑手失败'));
      }

      alert('已指派骑手');
      runtimeActionBindings.reloadPage();
    } catch (error) {
      alert(error instanceof Error ? error.message : '指派骑手失败');
    }
  }

  function handleDocumentClick(event: MouseEvent) {
    const target = getDispatchActionTarget(event.target);
    if (!target) return;

    const action = target.dataset.masterDispatchAction || '';
    const shopId = Number(target.dataset.masterDispatchShopId || 0);
    if (action === 'impersonate') {
      shopAdminBindings.impersonateMasterShop(shopId);
      return;
    }
    if (action === 'assign') {
      void masterDispatchAssignRider(target.dataset.masterDispatchOrderId || '', shopId);
      return;
    }
    if (action === 'remind') {
      void masterDispatchRepublish(target.dataset.masterDispatchOrderId || '', shopId);
    }
  }

  return {
    masterDispatchRepublish,
    handleDocumentClick,
  };
}
