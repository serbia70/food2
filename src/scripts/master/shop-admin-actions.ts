type InitMasterShopAdminActionsOptions = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterShopAdminActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterShopAdminActionsOptions) {
  function impersonateMasterShop(shopId: unknown) {
    if (!shopId) return;

    void (async () => {
      try {
        const res = await fetch('/api/master/impersonate-shop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: shopId }),
        });
        const data = await res.json();
        if (isUnauthorizedResponse(res, data)) {
          await handleMasterUnauthorized();
          return;
        }
        const impersonateSuccess = data && typeof data === 'object' && 'success' in data ? data.success : false;
        const impersonateSlug = data && typeof data === 'object' && 'slug' in data ? data.slug : '';
        if (!res.ok || !impersonateSuccess || typeof impersonateSlug !== 'string' || !impersonateSlug) {
          const impersonateError = data && typeof data === 'object' && 'error' in data ? data.error : null;
          alert(typeof impersonateError === 'string' && impersonateError ? impersonateError : '进入店铺后台失败');
          return;
        }
        try {
          localStorage.setItem('master_impersonated', '1');
        } catch {}
        window.location.href = `/admin/${impersonateSlug}`;
      } catch {
        alert('进入店铺后台失败');
      }
    })();
  }

  function deleteMasterShop(shopId: unknown, shopName: unknown) {
    if (!shopId) return;
    const safeShopName = String(shopName || '').trim();
    const token = `DELETE:${String(shopId)}`;

    const confirmApi = window.masterDangerConfirm && typeof window.masterDangerConfirm.open === 'function'
      ? window.masterDangerConfirm
      : null;
    const openConfirm = confirmApi
      ? confirmApi.open
      : () => Promise.resolve(window.confirm(`确认删除店铺 ${safeShopName || ''} 吗？此操作不可恢复。`));

    openConfirm({
      title: '确认删除店铺',
      description: '此操作不可恢复。删除后该店铺的管理入口将失效，请谨慎操作。',
      params: [
        { label: '店铺', value: safeShopName || '(未命名)' },
        { label: 'Shop ID', value: String(shopId) },
      ],
      confirmToken: token,
      inputLabel: '请输入确认词（区分大小写）',
      inputPlaceholder: token,
      confirmLabel: '删除店铺',
      cancelLabel: '取消',
      countdownSeconds: 3,
      onConfirm: async () => {
        const res = await fetch(`/api/master/shops/${encodeURIComponent(String(shopId))}`, {
          method: 'DELETE',
        });
        const data = await res.json().catch(() => ({}));
        if (isUnauthorizedResponse(res, data)) {
          await handleMasterUnauthorized();
          throw new Error('需要重新登录');
        }
        if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
          const deleteError = data && typeof data === 'object' && 'error' in data ? data.error : null;
          throw new Error(typeof deleteError === 'string' && deleteError ? deleteError : '删除店铺失败');
        }

        alert('店铺已删除，页面将刷新');
        window.location.reload();
      },
    }).then((ok: unknown) => {
      if (!ok) return;
    });
  }

  return {
    impersonateMasterShop,
    deleteMasterShop,
  };
}
