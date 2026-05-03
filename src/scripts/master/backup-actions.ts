import { normalizeCodeBackups, validateRestoreFilename } from '../../lib/master-backup-actions';

const MASTER_BACKUP_TARGET_BOUND_ATTR = 'data-master-backup-target-bound';

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

type SetStatusFeedback = (feedbackId: string, message: string, status?: string) => void;

type IsUnauthorizedResponse = (res: Response, data: unknown) => boolean;

type InitMasterBackupActionsOptions = {
  submitSettingsAction: SubmitSettingsAction;
  readNumberField: ReadNumberField;
  setStatusFeedback: SetStatusFeedback;
  isUnauthorizedResponse: IsUnauthorizedResponse;
  handleMasterUnauthorized: () => Promise<void>;
  canLoadProtectedMasterActions: boolean;
};

function renderMasterCodeBackupList(backups: ReturnType<typeof normalizeCodeBackups>) {
  const list = document.getElementById('master-code-backup-list');
  if (!(list instanceof HTMLElement)) return;

  if (backups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'backup-empty';
    empty.textContent = '暂无代码备份';
    list.replaceChildren(empty);
    return;
  }

  const nodes = backups.map((item) => {
    const createdText = new Date(item.created).toLocaleString('zh-CN');
    const article = document.createElement('article');
    article.className = 'backup-row';
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'backup-row-title';
    title.textContent = item.displayName;
    const meta = document.createElement('div');
    meta.className = 'backup-row-meta';
    meta.textContent = createdText;
    wrap.append(title, meta);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'backup-row-delete';
    button.dataset.backupDelete = item.name;
    button.textContent = '删除';
    article.append(wrap, button);
    return article;
  });

  list.replaceChildren(...nodes);
}

export function initMasterBackupActions({
  submitSettingsAction,
  readNumberField,
  setStatusFeedback,
  isUnauthorizedResponse,
  handleMasterUnauthorized,
  canLoadProtectedMasterActions,
}: InitMasterBackupActionsOptions) {
  function syncBackupMode(source: HTMLSelectElement) {
    const root = source.closest('form');
    const scope = root || document;
    const target = source.value;

    scope.querySelectorAll('[data-backup-mode]').forEach((section) => {
      if (!(section instanceof HTMLElement)) return;
      const mode = section.getAttribute('data-backup-mode');
      if (mode === 's3') {
        section.hidden = target !== 's3';
      } else if (mode === 'host') {
        section.hidden = target === 's3';
      }
    });
  }

  async function loadMasterCodeBackups() {
    const list = document.getElementById('master-code-backup-list');
    if (list instanceof HTMLElement) {
      const loading = document.createElement('div');
      loading.className = 'backup-empty';
      loading.textContent = '加载中...';
      list.replaceChildren(loading);
    }
    setStatusFeedback('master-code-backup-feedback', '正在加载代码备份列表...', 'muted');

    try {
      const res = await fetch('/api/master/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const listError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setStatusFeedback('master-code-backup-feedback', typeof listError === 'string' && listError ? listError : '代码备份列表加载失败', 'error');
        if (list instanceof HTMLElement) {
          const fail = document.createElement('div');
          fail.className = 'backup-empty';
          fail.textContent = '加载失败';
          list.replaceChildren(fail);
        }
        return;
      }

      const backups = normalizeCodeBackups(data && typeof data === 'object' && 'backups' in data ? data.backups : null);
      renderMasterCodeBackupList(backups);
      setStatusFeedback(
        'master-code-backup-feedback',
        backups.length ? `已加载 ${backups.length} 个代码备份` : '当前没有代码备份记录',
        backups.length ? 'success' : 'muted',
      );
    } catch {
      setStatusFeedback('master-code-backup-feedback', '网络错误，未能加载代码备份列表', 'error');
      if (list instanceof HTMLElement) {
        const error = document.createElement('div');
        error.className = 'backup-empty';
        error.textContent = '网络错误';
        list.replaceChildren(error);
      }
    }
  }

  async function submitMasterBackupSettings(form: HTMLFormElement) {
    const feedback = document.getElementById('master-backup-settings-feedback');
    try {
      await submitSettingsAction(form, {
        endpoint: '/api/master/settings',
        feedbackId: 'master-backup-settings-feedback',
        loadingText: '保存备份设置中...',
        successText: '备份设置已保存',
        buildPayload(currentForm) {
          const formData = new FormData(currentForm);
          const backupTarget = String(formData.get('backupTarget') || '').trim();
          const backupRetention = readNumberField(formData, 'backupRetention', '保留数量');
          if (backupRetention < 1) {
            throw new Error('保留数量不能小于 1');
          }
          const payload = {
            backupTime: String(formData.get('backupTime') || '').trim(),
            backupRetention,
            backupTarget,
            backupHost: String(formData.get('backupHost') || '').trim(),
            backupUser: String(formData.get('backupUser') || '').trim(),
            backupPass: String(formData.get('backupPass') || '').trim(),
            backupPath: String(formData.get('backupPath') || '').trim(),
            backupEndpoint: String(formData.get('backupEndpoint') || '').trim(),
            backupBucket: String(formData.get('backupBucket') || '').trim(),
          };
          if (backupTarget === 's3' && (!payload.backupEndpoint || !payload.backupBucket)) {
            throw new Error('S3 模式下必须填写 Endpoint 和 Bucket');
          }
          return payload;
        },
      });
    } catch (error) {
      if (feedback instanceof HTMLElement) {
        feedback.textContent = error instanceof Error ? error.message : '备份设置校验失败';
      }
    }
    return false;
  }

  async function createMasterCodeBackup(form: HTMLFormElement) {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!(submitBtn instanceof HTMLButtonElement)) return false;

    const formData = new FormData(form);
    const backupName = String(formData.get('backupName') || '').trim();
    if (!backupName) {
      setStatusFeedback('master-code-backup-feedback', '请输入代码备份名称', 'error');
      return false;
    }

    const originalText = submitBtn.textContent || '创建备份';
    submitBtn.disabled = true;
    submitBtn.textContent = '创建中...';
    setStatusFeedback('master-code-backup-feedback', '正在创建代码备份...', 'muted');

    try {
      const res = await fetch('/api/master/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', backupName }),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return false;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const createError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setStatusFeedback('master-code-backup-feedback', typeof createError === 'string' && createError ? createError : '代码备份创建失败', 'error');
        return false;
      }
      form.reset();
      const createMessage = data && typeof data === 'object' && 'message' in data ? data.message : null;
      setStatusFeedback('master-code-backup-feedback', typeof createMessage === 'string' && createMessage ? createMessage : '代码备份创建成功', 'success');
      await loadMasterCodeBackups();
    } catch {
      setStatusFeedback('master-code-backup-feedback', '网络错误，未能创建代码备份', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }

    return false;
  }

  async function deleteMasterCodeBackup(backupName: unknown) {
    const name = String(backupName || '').trim();
    if (!name) return;
    if (!window.confirm(`确定删除代码备份 ${name} 吗？`)) return;
    setStatusFeedback('master-code-backup-feedback', `正在删除代码备份：${name}`, 'muted');

    try {
      const res = await fetch('/api/master/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', backupName: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const deleteError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setStatusFeedback('master-code-backup-feedback', typeof deleteError === 'string' && deleteError ? deleteError : '代码备份删除失败', 'error');
        return;
      }
      const deleteMessage = data && typeof data === 'object' && 'message' in data ? data.message : null;
      setStatusFeedback('master-code-backup-feedback', typeof deleteMessage === 'string' && deleteMessage ? deleteMessage : '代码备份已删除', 'success');
      await loadMasterCodeBackups();
    } catch {
      setStatusFeedback('master-code-backup-feedback', '网络错误，未能删除代码备份', 'error');
    }
  }

  async function triggerMasterDataBackup(button: HTMLButtonElement) {
    const originalText = button.textContent || '立即备份';
    button.disabled = true;
    button.textContent = '备份中...';
    setStatusFeedback('master-data-backup-feedback', '正在触发数据备份任务...', 'muted');

    try {
      const res = await fetch('/api/master/trigger-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const backupError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setStatusFeedback('master-data-backup-feedback', typeof backupError === 'string' && backupError ? backupError : '数据备份触发失败', 'error');
        return;
      }
      const backupMessage = data && typeof data === 'object' && 'message' in data ? data.message : null;
      setStatusFeedback('master-data-backup-feedback', typeof backupMessage === 'string' && backupMessage ? backupMessage : '数据备份任务已提交', 'success');
    } catch {
      setStatusFeedback('master-data-backup-feedback', '网络错误，未能触发数据备份', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function triggerMasterRestore(button: HTMLButtonElement) {
    const fileInput = document.getElementById('master-restore-file');
    if (!(fileInput instanceof HTMLInputElement)) return;

    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (!file || !validateRestoreFilename(file.name)) {
      setStatusFeedback('master-restore-feedback', '请选择有效的 zip 还原文件', 'error');
      return;
    }
    if (!window.confirm('确认使用该备份覆盖当前系统数据吗？')) {
      return;
    }

    const originalText = button.textContent || '开始还原';
    button.disabled = true;
    button.textContent = '还原中...';
    setStatusFeedback('master-restore-feedback', `正在上传并还原：${file.name}`, 'muted');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/master/restore', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (isUnauthorizedResponse(res, data)) {
        await handleMasterUnauthorized();
        return;
      }
      if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
        const restoreError = data && typeof data === 'object' && 'error' in data ? data.error : null;
        setStatusFeedback('master-restore-feedback', typeof restoreError === 'string' && restoreError ? restoreError : '系统还原失败', 'error');
        return;
      }
      const restoreMessage = data && typeof data === 'object' && 'message' in data ? data.message : null;
      setStatusFeedback('master-restore-feedback', typeof restoreMessage === 'string' && restoreMessage ? restoreMessage : '系统还原成功，页面即将刷新', 'success');
      window.location.reload();
    } catch {
      setStatusFeedback('master-restore-feedback', '网络错误，未能执行系统还原', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function copyMasterLink(path: string) {
    if (!path) return;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      alert(`已复制链接：${url}`);
    } catch {
      alert('复制链接失败');
    }
  }

  function handleDocumentClick(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteBtn = target.closest('[data-backup-delete]');
    if (deleteBtn instanceof HTMLElement) {
      const backupName = deleteBtn.getAttribute('data-backup-delete');
      if (backupName) void deleteMasterCodeBackup(backupName);
    }

    const copyBtn = target.closest('[data-copy-link]');
    if (copyBtn instanceof HTMLElement) {
      const path = copyBtn.getAttribute('data-copy-link');
      if (path) void copyMasterLink(path);
    }
  }

  function handleDomContentLoaded() {
    document.querySelectorAll('[data-backup-target]').forEach((el) => {
      if (!(el instanceof HTMLSelectElement)) return;
      syncBackupMode(el);
      if (el.getAttribute(MASTER_BACKUP_TARGET_BOUND_ATTR) === '1') return;
      el.addEventListener('change', () => syncBackupMode(el));
      el.setAttribute(MASTER_BACKUP_TARGET_BOUND_ATTR, '1');
    });

    if (canLoadProtectedMasterActions) {
      void loadMasterCodeBackups();
      return;
    }

    const backupList = document.getElementById('master-code-backup-list');
    if (backupList instanceof HTMLElement) {
      backupList.textContent = '请重新登录主控后再加载代码备份。';
    }
    setStatusFeedback('master-code-backup-feedback', '当前主控登录态无效，请重新登录。', 'error');
  }

  return {
    submitMasterBackupSettings(form: HTMLFormElement) {
      void submitMasterBackupSettings(form);
      return false;
    },
    createMasterCodeBackup(form: HTMLFormElement) {
      void createMasterCodeBackup(form);
      return false;
    },
    deleteMasterCodeBackup,
    triggerMasterDataBackup(button: HTMLButtonElement) {
      void triggerMasterDataBackup(button);
    },
    triggerMasterRestore(button: HTMLButtonElement) {
      void triggerMasterRestore(button);
    },
    handleDocumentClick,
    handleDomContentLoaded,
  };
}
