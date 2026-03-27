type SubmitSettingsConfig = {
  endpoint?: string;
  feedbackId: string;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  networkErrorText?: string;
  buildPayload: (form: HTMLFormElement) => Record<string, unknown>;
  onSuccess?: (form: HTMLFormElement) => void;
};

type CreateMasterSettingsActionsOptions = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function createMasterSettingsActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: CreateMasterSettingsActionsOptions) {
  function readNumberField(formData: FormData, key: string, label: string) {
    const value = Number(formData.get(key));
    if (!Number.isFinite(value)) {
      throw new Error(`${label}必须是数字`);
    }
    return value;
  }

  function setFeedback(feedbackId: string, message: string) {
    const feedback = document.getElementById(feedbackId);
    if (feedback instanceof HTMLElement) {
      feedback.textContent = message;
    }
  }

  function setStatusFeedback(feedbackId: string, message: string, status = 'muted') {
    const feedback = document.getElementById(feedbackId);
    if (!(feedback instanceof HTMLElement)) return;
    feedback.textContent = message;
    feedback.dataset.status = status;
  }

  async function submitSettingsAction(form: HTMLFormElement, config: SubmitSettingsConfig) {
    const feedback = document.getElementById(config.feedbackId);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    feedback.textContent = config.loadingText || '保存中...';
    submitBtn.disabled = true;

    try {
      const payload = config.buildPayload(form);
      const res = await fetch(config.endpoint || '/api/master/settings', {
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
        const configError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        feedback.textContent = typeof configError === 'string' && configError ? configError : config.errorText || '保存失败，请检查后端支持范围';
        submitBtn.disabled = false;
        return;
      }
      feedback.textContent = config.successText || '保存成功';
      config.onSuccess?.(form);
    } catch {
      feedback.textContent = config.networkErrorText || '保存失败，请稍后重试';
    }

    submitBtn.disabled = false;
  }

  return {
    submitSettingsAction,
    readNumberField,
    setFeedback,
    setStatusFeedback,
  };
}
