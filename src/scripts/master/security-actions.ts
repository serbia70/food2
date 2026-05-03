import { createMasterSettingsActions } from './settings-actions';

type InitMasterSecurityActionsOptions = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterSecurityActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterSecurityActionsOptions) {
  const { submitSettingsAction } = createMasterSettingsActions({
    isUnauthorizedResponse,
    handleMasterUnauthorized,
  });
  async function handleSecuritySettings(form: HTMLFormElement) {
    const feedback = document.getElementById('master-security-feedback');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(feedback instanceof HTMLElement) || !(submitBtn instanceof HTMLButtonElement)) return;

    const formData = new FormData(form);
    const password = String(formData.get('password') || '').trim();
    const confirmPassword = String(formData.get('confirmPassword') || '').trim();

    if (!password) {
      feedback.textContent = '请输入新密码';
      return;
    }
    if (password !== confirmPassword) {
      feedback.textContent = '两次输入的密码不一致';
      return;
    }

    await submitSettingsAction(form, {
      endpoint: '/api/master/password',
      feedbackId: 'master-security-feedback',
      loadingText: '保存中...',
      successText: '超级密码已提交修改',
      errorText: '保存失败，请检查后端支持范围',
      networkErrorText: '保存失败，请稍后重试',
      buildPayload: () => ({ newPassword: password }),
      onSuccess: () => {
        form.reset();
      },
    });
  }

  return {
    submitMasterSecuritySettings(form: HTMLFormElement) {
      void handleSecuritySettings(form);
      return false;
    },
  };
}
