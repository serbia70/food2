type InitMasterShopCreateActionsOptions = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterShopCreateActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterShopCreateActionsOptions) {
  async function handleCreateShop(form: HTMLFormElement) {
    const feedback = document.getElementById('master-create-shop-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      slug: String(formData.get('slug') || '').trim(),
      password: String(formData.get('password') || '').trim(),
    };

    feedback.textContent = '创建中...';
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/master/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const createError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        feedback.textContent = typeof createError === 'string' && createError ? createError : '创建失败，请检查字段或后端能力';
        submitBtn.disabled = false;
        return;
      }
      feedback.textContent = '创建请求已提交，建议刷新页面确认新店铺是否已出现。';
      form.reset();
    } catch {
      feedback.textContent = '创建失败，请稍后重试';
    }

    submitBtn.disabled = false;
  }

  return {
    submitMasterCreateShop(form: HTMLFormElement) {
      void handleCreateShop(form);
      return false;
    },
  };
}
