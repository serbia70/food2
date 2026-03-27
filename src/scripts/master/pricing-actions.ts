import { createMasterSettingsActions } from './settings-actions';

type InitMasterPricingActionsOptions = {
  buildMasterPricingSettingsPayload: (input: Record<string, FormDataEntryValue>) => Record<string, unknown>;
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterPricingActions({
  buildMasterPricingSettingsPayload,
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterPricingActionsOptions) {
  const { submitSettingsAction } = createMasterSettingsActions({
    isUnauthorizedResponse,
    handleMasterUnauthorized,
  });
  async function handlePricingSettings(form: HTMLFormElement) {
    const feedback = document.getElementById('master-pricing-settings-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const formData = new FormData(form);
    const payload = buildMasterPricingSettingsPayload(Object.fromEntries(formData.entries()));

    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-pricing-settings-feedback',
      loadingText: '保存中...',
      successText: '套餐与提成设置已保存',
      errorText: '保存失败，请检查后端支持范围',
      networkErrorText: '保存失败，请稍后重试',
      buildPayload: () => payload,
    });
  }

  return {
    submitMasterPricingSettings(form: HTMLFormElement) {
      void handlePricingSettings(form);
      return false;
    },
  };
}
