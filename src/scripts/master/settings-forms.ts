type SubmitSettingsAction = (
  form: HTMLFormElement,
  config: {
    endpoint?: string;
    feedbackId: string;
    loadingText?: string;
    successText?: string;
    errorText?: string;
    networkErrorText?: string;
    buildPayload: (form: HTMLFormElement) => Record<string, unknown>;
  },
) => Promise<void>;

type ReadNumberField = (formData: FormData, key: string, label: string) => number;

type SetFeedback = (feedbackId: string, message: string) => void;

type InitMasterSettingsFormsOptions = {
  submitSettingsAction: SubmitSettingsAction;
  readNumberField: ReadNumberField;
  setFeedback: SetFeedback;
};

export function initMasterSettingsForms({
  submitSettingsAction,
  readNumberField,
  setFeedback,
}: InitMasterSettingsFormsOptions) {
  async function submitMasterCategoriesSettings(form: HTMLFormElement) {
    const feedbackId = 'master-categories-settings-feedback';
    try {
      const formData = new FormData(form);
      const rawJson = String(formData.get('categoriesJson') || '').trim();
      const categories = JSON.parse(rawJson || '[]');
      setFeedback(feedbackId, '保存分类配置中...');
      const res = await fetch('/api/master/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categories),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const categoryError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setFeedback(feedbackId, typeof categoryError === 'string' && categoryError ? categoryError : '分类配置保存失败');
      } else {
        setFeedback(feedbackId, '分类配置已保存');
      }
    } catch (error) {
      setFeedback(feedbackId, error instanceof Error ? `分类 JSON 无效：${error.message}` : '分类 JSON 无效');
    }
    return false;
  }

  async function submitMasterServerSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-server-settings-feedback',
      loadingText: '保存 MQTT / Telegram 配置中...',
      successText: 'MQTT / Telegram 配置已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        const mqttBroker = String(formData.get('mqttBroker') || '').trim();
        const telegramWebhookSecret = String(formData.get('telegramWebhookSecret') || '').trim();
        const telegramChatId = String(formData.get('telegramChatId') || '').trim();
        const telegramBotToken = String(formData.get('telegramBotToken') || '').trim();
        return {
          mqttBroker,
          telegramWebhookSecret,
          telegramChatId,
          telegramBotToken,
        };
      },
    });
    return false;
  }

  async function submitMasterFooterSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-footer-settings-feedback',
      loadingText: '保存页脚设置中...',
      successText: '页脚设置已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        return {
          footerText: String(formData.get('footerText') || '').trim(),
          footerPhone: String(formData.get('footerPhone') || '').trim(),
          footerCopyright: String(formData.get('footerCopyright') || '').trim(),
        };
      },
    });
    return false;
  }

  async function submitMasterRateSettings(form: HTMLFormElement) {
    const feedback = document.getElementById('master-rate-settings-feedback');
    try {
      await submitSettingsAction(form, {
        endpoint: '/api/master/settings',
        feedbackId: 'master-rate-settings-feedback',
        loadingText: '保存汇率与费率中...',
        successText: '汇率与费率设置已保存',
        buildPayload(currentForm) {
          const formData = new FormData(currentForm);
          return {
            exchangeRate: readNumberField(formData, 'exchangeRate', '汇率'),
            displayFinalRate: readNumberField(formData, 'displayFinalRate', '展示最终费率'),
            rateBase: readNumberField(formData, 'rateBase', '基础费率'),
            rateOffset: readNumberField(formData, 'rateOffset', '费率偏移'),
            rateStep: readNumberField(formData, 'rateStep', '费率步进'),
          };
        },
      });
    } catch (error) {
      if (feedback instanceof HTMLElement) {
        feedback.textContent = error instanceof Error ? error.message : '数值校验失败';
      }
    }
    return false;
  }

  async function submitMasterWechatSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-wechat-settings-feedback',
      loadingText: '保存微信联系设置中...',
      successText: '微信联系设置已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        return {
          wechatId: String(formData.get('wechatId') || '').trim(),
          wechatContactQr: String(formData.get('wechatContactQr') || '').trim(),
        };
      },
    });
    return false;
  }

  async function submitMasterPaymentSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-payment-settings-feedback',
      loadingText: '保存收款码设置中...',
      successText: '收款码设置已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        return {
          alipayPaymentQr: String(formData.get('alipayPaymentQr') || '').trim(),
          wechatPaymentQr: String(formData.get('wechatPaymentQr') || '').trim(),
        };
      },
    });
    return false;
  }

  async function submitMasterStorageSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-storage-settings-feedback',
      loadingText: '保存图片 / R2 设置中...',
      successText: '图片 / R2 设置已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        return {
          imageStorage: String(formData.get('imageStorage') || 'local').trim(),
          r2PublicDomain: String(formData.get('r2PublicDomain') || '').trim(),
          uploadStrictR2: formData.get('uploadStrictR2') === 'on',
        };
      },
    });
    return false;
  }

  async function submitMasterShopDefaultsSettings(form: HTMLFormElement) {
    await submitSettingsAction(form, {
      endpoint: '/api/master/settings',
      feedbackId: 'master-shop-defaults-settings-feedback',
      loadingText: '保存店铺默认城市与营业时间中...',
      successText: '店铺默认城市与营业时间已保存',
      buildPayload(currentForm) {
        const formData = new FormData(currentForm);
        const city = String(formData.get('defaultCity') || '').trim();
        const open = String(formData.get('defaultOpenTime') || '').trim();
        const close = String(formData.get('defaultCloseTime') || '').trim();
        return {
          shopDefaults: {
            city,
            hours: {
              open,
              close,
            },
          },
          default_city: city,
          default_open_time: open,
          default_close_time: close,
        };
      },
    });
    return false;
  }

  return {
    submitMasterCategoriesSettings(form: HTMLFormElement) {
      void submitMasterCategoriesSettings(form);
      return false;
    },
    submitMasterServerSettings(form: HTMLFormElement) {
      void submitMasterServerSettings(form);
      return false;
    },
    submitMasterFooterSettings(form: HTMLFormElement) {
      void submitMasterFooterSettings(form);
      return false;
    },
    submitMasterRateSettings(form: HTMLFormElement) {
      void submitMasterRateSettings(form);
      return false;
    },
    submitMasterWechatSettings(form: HTMLFormElement) {
      void submitMasterWechatSettings(form);
      return false;
    },
    submitMasterPaymentSettings(form: HTMLFormElement) {
      void submitMasterPaymentSettings(form);
      return false;
    },
    submitMasterStorageSettings(form: HTMLFormElement) {
      void submitMasterStorageSettings(form);
      return false;
    },
    submitMasterShopDefaultsSettings(form: HTMLFormElement) {
      void submitMasterShopDefaultsSettings(form);
      return false;
    },
  };
}
