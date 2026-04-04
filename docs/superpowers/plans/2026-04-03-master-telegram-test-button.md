# Master Telegram Test Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 master 的 MQTT / Telegram 配置卡片中增加“发送测试消息”按钮，直接验证全局 Telegram Bot Token 与 Chat ID 是否可用。

**Architecture:** 前端继续复用 `src/scripts/master/settings-forms.ts` 作为 master settings 的唯一交互绑定点，在现有 server settings 表单里增加一个测试按钮，读取当前输入框值并调用新的本地 BFF 路由 `/api/master/telegram-test`。后端 route 只负责读取请求体或 fallback 到当前已保存 master settings，然后直接请求 Telegram Bot API `sendMessage` 并返回结构化结果，不写入任何配置。

**Tech Stack:** Astro API routes、TypeScript、Node built-in test runner、pnpm

---

## File map

- `src/components/master/MasterServerSettingsCard.astro`
  - 在现有 server settings 卡片里增加“发送测试消息”按钮
  - 继续复用 `#master-server-settings-feedback`
- `src/scripts/master/settings-forms.ts`
  - 扩展 `initMasterSettingsForms()`，增加 server settings 测试消息动作
  - 从当前表单读取 `telegramBotToken` / `telegramChatId`
  - 负责按钮 loading、调用 `/api/master/telegram-test`、更新反馈文案
- `src/scripts/master/settings-forms.test.ts`
  - 先写失败测试，锁住测试消息请求 payload、按钮 loading、反馈更新逻辑
- `src/pages/api/master/telegram-test.ts`
  - 新建本地 route
  - 读取请求体 JSON
  - 缺省时 fallback 到当前 master settings
  - 调 Telegram `sendMessage`
  - 返回 spec 约定的 success/error 结构
- `src/pages/api/master/telegram-test.test.ts`
  - 先写失败测试，锁住缺 token、缺 chatId、Telegram 成功、Telegram 失败、非法 JSON

## Scope guardrails

- 不改 Go 后端
- 不改真实订单广播逻辑
- 不给 admin 页面补测试按钮
- 不新增骑手定向测试
- 不改 `src/pages/master/index.astro`
- 不把“发送测试消息”做成通用抽象组件

### Task 1: 先锁住 master settings 前端测试按钮行为

**Files:**
- Modify: `src/scripts/master/settings-forms.test.ts`
- Modify: `src/scripts/master/settings-forms.ts`
- Modify: `src/components/master/MasterServerSettingsCard.astro`

- [ ] **Step 1: Write the failing test**

在 `src/scripts/master/settings-forms.test.ts` 追加下面两组测试：

```ts
test('submitMasterServerTelegramTest posts current telegram fields to telegram-test endpoint', async () => {
  const feedbackCalls: Array<{ id: string; message: string }> = [];
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  const OriginalFormData = globalThis.FormData;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;

  const button = {
    disabled: false,
    textContent: '发送测试消息',
    dataset: {},
  } as unknown as HTMLButtonElement;
  const feedback = { textContent: '' } as HTMLDivElement;

  globalThis.FormData = class FakeFormData {
    constructor(private readonly source: { entries: Record<string, string> }) {}
    get(key: string) {
      return this.source.entries[key] ?? null;
    }
  } as typeof FormData;

  Object.defineProperty(globalThis, 'document', {
    value: {
      getElementById(id: string) {
        if (id === 'master-server-settings-feedback') return feedback;
        return null;
      },
    },
    configurable: true,
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, ok: true, result: { message_id: 321 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const actions = initMasterSettingsForms({
    async submitSettingsAction() {
      throw new Error('submitSettingsAction should not be used');
    },
    readNumberField() {
      throw new Error('readNumberField should not be used');
    },
    setFeedback(id, message) {
      feedbackCalls.push({ id, message });
      feedback.textContent = message;
    },
  });

  const form = {
    entries: {
      telegramBotToken: ' bot-token-123 ',
      telegramChatId: ' -100998877 ',
    },
    querySelector(selector: string) {
      if (selector === '[data-master-telegram-test-button]') return button;
      return null;
    },
  } as HTMLFormElement & { entries: Record<string, string> };

  await actions.submitMasterServerTelegramTest(form);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/master/telegram-test');
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '发送测试消息');
  assert.equal(feedback.textContent, '测试消息已发送');
  assert.deepEqual(JSON.parse(String(fetchCalls[0].init?.body || '{}')), {
    telegramBotToken: 'bot-token-123',
    telegramChatId: '-100998877',
    text: 'Master Telegram 测试消息',
  });

  globalThis.FormData = OriginalFormData;
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'document', {
    value: originalDocument,
    configurable: true,
  });
});

test('submitMasterServerTelegramTest shows structured telegram error message', async () => {
  const feedback = { textContent: '' } as HTMLDivElement;
  const OriginalFormData = globalThis.FormData;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;

  globalThis.FormData = class FakeFormData {
    constructor(private readonly source: { entries: Record<string, string> }) {}
    get(key: string) {
      return this.source.entries[key] ?? null;
    }
  } as typeof FormData;

  Object.defineProperty(globalThis, 'document', {
    value: {
      getElementById(id: string) {
        if (id === 'master-server-settings-feedback') return feedback;
        return null;
      },
    },
    configurable: true,
  });

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: false,
    error: 'telegram_chat_id_required',
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  const actions = initMasterSettingsForms({
    async submitSettingsAction() {
      throw new Error('submitSettingsAction should not be used');
    },
    readNumberField() {
      throw new Error('readNumberField should not be used');
    },
    setFeedback(id, message) {
      if (id === 'master-server-settings-feedback') feedback.textContent = message;
    },
  });

  const form = {
    entries: {
      telegramBotToken: 'bot-token-123',
      telegramChatId: '',
    },
    querySelector() {
      return null;
    },
  } as HTMLFormElement & { entries: Record<string, string> };

  await actions.submitMasterServerTelegramTest(form);

  assert.equal(feedback.textContent, '发送失败: telegram_chat_id_required');

  globalThis.FormData = OriginalFormData;
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'document', {
    value: originalDocument,
    configurable: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/scripts/master/settings-forms.test.ts`

Expected: FAIL，原因应是 `initMasterSettingsForms()` 还没有 `submitMasterServerTelegramTest()`，也还没有向 `/api/master/telegram-test` 发请求的逻辑。

- [ ] **Step 3: Write minimal implementation**

在 `src/scripts/master/settings-forms.ts` 里追加一个专门给 server settings 用的测试动作；不要新建通用 helper，只补最小逻辑：

```ts
async function submitMasterServerTelegramTest(form: HTMLFormElement) {
  const feedbackId = 'master-server-settings-feedback';
  const button = form.querySelector('[data-master-telegram-test-button]');
  const testButton = button instanceof HTMLButtonElement ? button : null;
  const originalText = testButton?.textContent || '发送测试消息';

  try {
    if (testButton) {
      testButton.disabled = true;
      testButton.textContent = '发送中...';
    }
    setFeedback(feedbackId, '发送测试消息中...');

    const formData = new FormData(form);
    const telegramBotToken = String(formData.get('telegramBotToken') || '').trim();
    const telegramChatId = String(formData.get('telegramChatId') || '').trim();
    const response = await fetch('/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken,
        telegramChatId,
        text: 'Master Telegram 测试消息',
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
      const error = typeof data?.telegram_response?.description === 'string' && data.telegram_response.description.trim()
        ? data.telegram_response.description.trim()
        : String(data?.error || 'telegram_send_failed').trim();
      setFeedback(feedbackId, `发送失败: ${error || 'telegram_send_failed'}`);
      return false;
    }

    setFeedback(feedbackId, '测试消息已发送');
    return false;
  } catch (error) {
    setFeedback(feedbackId, `发送失败: ${error instanceof Error ? error.message : 'telegram_send_failed'}`);
    return false;
  } finally {
    if (testButton) {
      testButton.disabled = false;
      testButton.textContent = originalText;
    }
  }
}
```

并把返回对象扩成：

```ts
return {
  submitMasterCategoriesSettings(form: HTMLFormElement) {
    void submitMasterCategoriesSettings(form);
    return false;
  },
  submitMasterServerSettings(form: HTMLFormElement) {
    void submitMasterServerSettings(form);
    return false;
  },
  submitMasterServerTelegramTest(form: HTMLFormElement) {
    return submitMasterServerTelegramTest(form);
  },
  // 其余保持不变
};
```

同时把 `src/components/master/MasterServerSettingsCard.astro` 的操作区改成下面结构：

```astro
<div class="settings-actions">
  <button type="submit" class="settings-submit">保存 MQTT / Telegram 配置</button>
  <button
    type="button"
    class="settings-secondary"
    data-master-telegram-test-button
    onclick="return window.submitMasterServerTelegramTest ? window.submitMasterServerTelegramTest(this.form) : false;"
  >
    发送测试消息
  </button>
  <div id="master-server-settings-feedback" class="settings-feedback">修改后请同步确认客户端、打印机和 Telegram 机器人回调配置是否仍然可用。</div>
</div>
```

补一条最小样式：

```astro
.settings-secondary {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 12px 16px;
  background: #fff;
  color: #0f172a;
  font-weight: 800;
  cursor: pointer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/scripts/master/settings-forms.test.ts`

Expected: PASS，并且新测试能确认：
- 请求发到 `/api/master/telegram-test`
- payload 取自当前输入框
- 成功时反馈 `测试消息已发送`
- 失败时反馈 `发送失败: ...`

- [ ] **Step 5: Commit**

```bash
git add src/components/master/MasterServerSettingsCard.astro src/scripts/master/settings-forms.ts src/scripts/master/settings-forms.test.ts && git commit -m "feat: add master telegram test button"
```

### Task 2: 新增本地 telegram-test route 并锁住 fallback / Telegram 返回契约

**Files:**
- Create: `src/pages/api/master/telegram-test.test.ts`
- Create: `src/pages/api/master/telegram-test.ts`
- Reference: `src/pages/api/master/settings.ts`
- Reference: `src/pages/api/admin/rider-assign.ts`

- [ ] **Step 1: Write the failing test**

新建 `src/pages/api/master/telegram-test.test.ts`，写下面 5 组测试：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://food2.serbia70.com';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/master/telegram-test.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  return {
    get(name: string) {
      if (name === 'master_token') return { value: 'master-token-1' };
      return undefined;
    },
  };
}

test('returns telegram_bot_token_not_configured when body and saved settings both miss token', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://food2.serbia70.com/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: '-1001', telegramBotToken: '' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: '', telegramChatId: '' }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_bot_token_not_configured',
  });
});

test('returns telegram_chat_id_required when resolved chat id is empty', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://food2.serbia70.com/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: '', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: '', telegramChatId: '' }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_chat_id_required',
  });
});

test('sends telegram message with request body values before saved settings fallback', async () => {
  let telegramRequest: { url: string; body: Record<string, unknown> } | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.telegram.org/botinline-token/sendMessage') {
      telegramRequest = {
        url,
        body: JSON.parse(String(init?.body || '{}')),
      };
      return new Response(JSON.stringify({ ok: true, result: { message_id: 555 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://food2.serbia70.com/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: 'saved-chat-id', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
        text: 'Master Telegram 测试消息',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    ok: true,
    result: { message_id: 555 },
  });
  assert.deepEqual(telegramRequest, {
    url: 'https://api.telegram.org/botinline-token/sendMessage',
    body: {
      chat_id: '-100998877',
      text: 'Master Telegram 测试消息',
    },
  });
});

test('returns structured telegram_send_failed payload when telegram api rejects request', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.telegram.org/botinline-token/sendMessage') {
      return new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === 'https://food2.serbia70.com/api/master/settings') {
      return new Response(JSON.stringify({
        success: true,
        settings: { telegramChatId: 'saved-chat-id', telegramBotToken: 'saved-bot-token' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramBotToken: 'inline-token',
        telegramChatId: '-100998877',
        text: 'Master Telegram 测试消息',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_send_failed',
    telegram_status: 400,
    telegram_response: { ok: false, description: 'Bad Request: chat not found' },
  });
});

test('returns invalid_json when request body is not valid json', async () => {
  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/master/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'invalid_json',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/pages/api/master/telegram-test.test.ts`

Expected: FAIL，原因应是文件尚不存在。

- [ ] **Step 3: Write minimal implementation**

新建 `src/pages/api/master/telegram-test.ts`，直接按下面结构实现：

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config.ts';
import { proxyMasterRequest } from '../../../lib/master-api-route.ts';

export const prerender = false;

type MasterSettingsResponse = {
  success?: boolean;
  settings?: {
    telegramBotToken?: string | null;
    telegramChatId?: string | null;
    telegram_bot_token?: string | null;
    telegram_chat_id?: string | null;
  };
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readSavedTelegramSettings(request: Request, cookies: Parameters<APIRoute['POST']>[0]['cookies']) {
  const response = await proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/settings`,
    method: 'GET',
  });
  const text = await response.text();
  if (!response.ok) return { telegramBotToken: '', telegramChatId: '' };
  try {
    const parsed = JSON.parse(text) as MasterSettingsResponse;
    return {
      telegramBotToken: String(parsed.settings?.telegramBotToken || parsed.settings?.telegram_bot_token || '').trim(),
      telegramChatId: String(parsed.settings?.telegramChatId || parsed.settings?.telegram_chat_id || '').trim(),
    };
  } catch {
    return { telegramBotToken: '', telegramChatId: '' };
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return json({ success: false, error: 'invalid_json' }, 400);
  }

  const saved = await readSavedTelegramSettings(request, cookies);
  const telegramBotToken = String(payload.telegramBotToken || '').trim() || saved.telegramBotToken;
  const telegramChatId = String(payload.telegramChatId || '').trim() || saved.telegramChatId;
  const text = String(payload.text || 'Master Telegram 测试消息').trim() || 'Master Telegram 测试消息';

  if (!telegramBotToken) {
    return json({ success: false, error: 'telegram_bot_token_not_configured' }, 400);
  }

  if (!telegramChatId) {
    return json({ success: false, error: 'telegram_chat_id_required' }, 400);
  }

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
      }),
    });
    const telegramText = await telegramResponse.text();
    const telegramJson = telegramText ? JSON.parse(telegramText) as Record<string, unknown> : {};

    if (!telegramResponse.ok || telegramJson.ok !== true) {
      return json({
        success: false,
        error: 'telegram_send_failed',
        telegram_status: telegramResponse.status,
        telegram_response: telegramJson,
      }, 502);
    }

    return json({
      success: true,
      ok: true,
      result: telegramJson.result,
    }, 200);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'telegram_send_failed',
    }, 502);
  }
};
```

如果在实现时 `proxyMasterRequest` 导入路径需要和仓库其余文件一致，统一补成带 `.ts` 扩展名。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/pages/api/master/telegram-test.test.ts`

Expected: PASS，覆盖：
- 缺 token
- 缺 chatId
- 请求体优先于已保存 settings
- Telegram 成功响应
- Telegram 失败响应
- 非法 JSON

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/master/telegram-test.ts src/pages/api/master/telegram-test.test.ts && git commit -m "feat: add master telegram test api"
```

### Task 3: 收口页面源码和回归验证

**Files:**
- Modify: `src/components/master/MasterServerSettingsCard.astro`
- Modify: `src/scripts/master/settings-forms.ts`
- Modify: `src/scripts/master/settings-forms.test.ts`
- Create: `src/pages/api/master/telegram-test.ts`
- Create: `src/pages/api/master/telegram-test.test.ts`

- [ ] **Step 1: Write the failing source assertion test**

如果 Task 1 只测了脚本行为，再补一条源码断言，锁住按钮已出现在组件源码里。在 `src/scripts/master/settings-forms.test.ts` 追加：

```ts
test('MasterServerSettingsCard source contains telegram test button binding', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/components/master/MasterServerSettingsCard.astro'), 'utf8');

  assert.match(source, /发送测试消息/);
  assert.match(source, /data-master-telegram-test-button/);
  assert.match(source, /submitMasterServerTelegramTest/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/scripts/master/settings-forms.test.ts`

Expected: 如果前面还没补按钮源码，这里先 FAIL；如果 Task 1 已补完，可把这一步视为验证回归保护已建立。

- [ ] **Step 3: Make the minimal code green**

确认以下最终状态都已经落地：

`src/components/master/MasterServerSettingsCard.astro` 包含：

```astro
<button
  type="button"
  class="settings-secondary"
  data-master-telegram-test-button
  onclick="return window.submitMasterServerTelegramTest ? window.submitMasterServerTelegramTest(this.form) : false;"
>
  发送测试消息
</button>
```

`src/scripts/master/settings-forms.ts` 返回对象包含：

```ts
submitMasterServerTelegramTest(form: HTMLFormElement) {
  return submitMasterServerTelegramTest(form);
},
```

- [ ] **Step 4: Run focused tests and one project-level regression command**

Run: `node --test src/scripts/master/settings-forms.test.ts src/pages/api/master/telegram-test.test.ts`

Expected: PASS

再跑：`pnpm run test:security`

Expected: PASS；如果仓库当前已有与本任务无关的红灯，记录下来，但本任务新增测试必须保持全绿。

- [ ] **Step 5: Commit**

```bash
git add src/components/master/MasterServerSettingsCard.astro src/scripts/master/settings-forms.ts src/scripts/master/settings-forms.test.ts src/pages/api/master/telegram-test.ts src/pages/api/master/telegram-test.test.ts && git commit -m "feat: add master telegram test flow"
```

## Self-review

- spec 要求的按钮位置、反馈区复用、本地 API、错误文案、测试范围都已映射到任务
- 未混入 admin 测试按钮、骑手定向测试、真实派单逻辑修改、Go 后端改动
- 前端只做读取表单、POST、反馈更新三件事；后端只做读取配置和发送测试消息
- 所有任务都给出精确文件、测试代码、执行命令与预期结果
