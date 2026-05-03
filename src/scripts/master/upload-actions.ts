type InitMasterUploadActionsOptions = {
  isUnauthorizedResponse: (res: Response, data: unknown) => boolean;
  handleMasterUnauthorized: () => Promise<void>;
};

export function initMasterUploadActions({
  isUnauthorizedResponse,
  handleMasterUnauthorized,
}: InitMasterUploadActionsOptions) {
  async function triggerMasterUpload(fieldName: unknown) {
    const nextFieldName = String(fieldName || '').trim();
    if (!nextFieldName) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);
      const field = document.querySelector(`[name="${nextFieldName}"]`);
      const button = document.querySelector(`[data-master-upload-field="${nextFieldName}"]`);

      if (button instanceof HTMLButtonElement) {
        button.disabled = true;
        button.textContent = '上传中';
      }

      try {
        const res = await fetch('/api/master/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (isUnauthorizedResponse(res, data)) {
          await handleMasterUnauthorized();
          return;
        }
        const uploadSuccess = data && typeof data === 'object' && 'success' in data ? data.success : false;
        const uploadUrl = data && typeof data === 'object' && 'url' in data ? data.url : '';
        if (!res.ok || !uploadSuccess || !uploadUrl) {
          const uploadError = data && typeof data === 'object' && 'error' in data ? data.error : null;
          alert(typeof uploadError === 'string' && uploadError ? uploadError : '上传失败');
          return;
        }
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          field.value = String(uploadUrl);
        }
        alert('上传成功，已回填地址');
      } catch {
        alert('上传失败，请稍后重试');
      } finally {
        if (button instanceof HTMLButtonElement) {
          button.disabled = false;
          button.textContent = '上传';
        }
      }
    };
    input.click();
  }

  return {
    triggerMasterUpload,
  };
}
