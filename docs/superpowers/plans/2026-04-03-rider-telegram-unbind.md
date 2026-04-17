# Rider Telegram Unbind Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 rider 端补解绑能力时的实施步骤；文中的红灯预期属于当时新增接口与页面接线阶段，不应直接当作当前仓库状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在骑手端增加“解除 Telegram 绑定”能力，让当前骑手可一键清空自己的 Telegram 绑定并立即重新测试绑定流程。

**Architecture:** 新增站内 API `src/pages/api/rider/telegram/unbind.ts`，只负责把当前骑手的 `telegram_chat_id` 清空并透传后端结果。`src/pages/rider/dashboard.astro` 在已绑定态展示解绑按钮，调用该 API 成功后立即清空本地 session 的 `telegramChatId`、重置 `bindState`，并重新渲染绑定面板。

**Tech Stack:** Astro API routes、TypeScript、Node built-in test runner、pnpm

---

## File map

- `src/pages/api/rider/telegram/unbind.ts`
  - 新增骑手解绑 API
  - 校验 `riderId` / `riderPhone`
  - 转发到后端 `/api/rider/status`，把 `telegram_chat_id` 置空字符串
- `src/tests/pages/api/rider-telegram-unbind.test.ts`
  - 覆盖缺字段与成功解绑分支
- `src/pages/rider/dashboard.astro`
  - 已绑定态显示“解除 Telegram 绑定”按钮
  - 新增 `unbindTelegram()`
  - 成功后清空本地 `telegramChatId` 并重置 `bindState`
- `src/tests/pages/rider-dashboard-canonical.test.ts`
  - 锁定解绑按钮、解绑函数、成功后的本地状态回收逻辑

## Scope guardrails

- 不改 admin/master 页面
- 不改 Telegram webhook / bot 命令
- 不改现有绑定 token 生成逻辑
- 不把解绑塞进 `updateStatus()`
- 不新增多骑手批量解绑能力

### Task 1: 新增骑手 Telegram 解绑 API

**Files:**
- Create: `src/tests/pages/api/rider-telegram-unbind.test.ts`
- Create: `src/pages/api/rider/telegram/unbind.ts`
- Reference: `src/pages/api/rider/telegram/bind.ts:16-54`
- Reference: `src/pages/api/telegram/rider-bind.ts:72-82`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/api/rider-telegram-unbind.test.ts` 写下面测试：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../../../pages/api/rider/telegram/unbind.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider telegram unbind 在缺少 rider 信息时返回 rider_session_required', async () => {
  const request = new Request('http://localhost/api/rider/telegram/unbind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riderId: 0, riderPhone: '' }),
  });

  const response = await POST({ request } as any);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'rider_session_required',
  });
});

test('POST rider telegram unbind 会把 telegram_chat_id 清空后转发到后端', async () => {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    assert.equal(url, 'https://food2.serbia70.com/api/rider/status');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 7,
      telegram_chat_id: '',
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const request = new Request('http://localhost/api/rider/telegram/unbind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      riderId: 7,
      riderPhone: '0613083899',
    }),
  });

  const response = await POST({ request } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "src/tests/pages/api/rider-telegram-unbind.test.ts"`

历史红灯预期：，因为 `src/pages/api/rider/telegram/unbind.ts` 还不存在。

- [ ] **Step 3: Write minimal implementation**

创建 `src/pages/api/rider/telegram/unbind.ts`：

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../../config.ts';

export const prerender = false;

function readApiBaseUrl(): string {
  return process.env.PUBLIC_API_URL || API_BASE_URL;
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const riderId = Number(body.riderId || 0);
  const riderPhone = String(body.riderPhone || '').trim();
  if (riderId <= 0 || !riderPhone) {
    return new Response(JSON.stringify({ success: false, error: 'rider_session_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(`${readApiBaseUrl()}/api/rider/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: riderId, telegram_chat_id: '' }),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "src/tests/pages/api/rider-telegram-unbind.test.ts"`

Expected: PASS，2 个测试全绿。

- [ ] **Step 5: Commit**

```bash
git add src/tests/pages/api/rider-telegram-unbind.test.ts src/pages/api/rider/telegram/unbind.ts && git commit -m "$(cat <<'EOF'
feat: add rider telegram unbind api
EOF
)"
```

### Task 2: 在骑手端接入解绑按钮并即时回显

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/tests/pages/rider-dashboard-canonical.test.ts`
- Reference: `src/lib/rider-session.ts:41-44`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/rider-dashboard-canonical.test.ts` 追加下面断言：

```ts
assert.match(source, /<button id="unbind-telegram-btn" class="btn-action" type="button">解除 Telegram 绑定<\/button>/);
assert.match(source, /if \(unbindBtn\) unbindBtn\.addEventListener\('click', unbindTelegram\);/);
assert.match(source, /async function unbindTelegram\(\) \{/);
assert.match(source, /const res = await fetch\('\/api\/rider\/telegram\/unbind', \{/);
assert.match(source, /if \(!confirm\('确认解除 Telegram 绑定？'\)\) return;/);
assert.match(source, /telegramChatId: ''/);
assert.match(source, /bindState = \{ httpsUrl: '', tgUrl: '', startCommand: '', ready: false \ };/);
assert.match(source, /alert\('已解除 Telegram 绑定'\);/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "src/tests/pages/rider-dashboard-canonical.test.ts"`

历史红灯预期：，因为当前页面还没有解绑按钮和 `unbindTelegram()`。

- [ ] **Step 3: Write minimal implementation**

在 `src/pages/rider/dashboard.astro` 做下面修改。

先把已绑定态按钮改成同时显示解绑入口，把 `renderTelegramBindingPanel()` 里的模板：

```ts
${bound ? '' : '<button id="bind-telegram-btn" class="btn-action btn-map" type="button">绑定 Telegram</button>'}
```

替换为：

```ts
${bound ? '<button id="unbind-telegram-btn" class="btn-action" type="button">解除 Telegram 绑定</button>' : '<button id="bind-telegram-btn" class="btn-action btn-map" type="button">绑定 Telegram</button>'}
```

再在事件绑定区块里，紧接在 `bindBtn` 之后加入：

```ts
const unbindBtn = document.getElementById('unbind-telegram-btn');
if (unbindBtn) unbindBtn.addEventListener('click', unbindTelegram);
```

然后在 `bindTelegram()` 后新增 `unbindTelegram()`：

```ts
async function unbindTelegram() {
  if (!rider) return;
  if (!confirm('确认解除 Telegram 绑定？')) return;
  try {
    const res = await fetch('/api/rider/telegram/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riderId: rider.id, riderPhone: rider.phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || 'unbind_failed');
    }
    bindState = { httpsUrl: '', tgUrl: '', startCommand: '', ready: false };
    persistRiderSession({
      ...rider,
      telegramChatId: '',
    });
    alert('已解除 Telegram 绑定');
  } catch (error) {
    alert(`Telegram 解绑失败: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "src/tests/pages/rider-dashboard-canonical.test.ts"`

Expected: PASS，源测试断言全部通过。

- [ ] **Step 5: Run focused regression tests**

Run: `node --test "src/tests/pages/rider-dashboard-canonical.test.ts" "src/tests/pages/api/rider-telegram-bind.test.ts" "src/tests/pages/api/telegram-rider-bind.test.ts" "src/tests/pages/api/rider-telegram-unbind.test.ts"`

Expected: PASS，解绑新链路与现有绑定链路同时保持全绿。

- [ ] **Step 6: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts src/tests/pages/api/rider-telegram-unbind.test.ts src/pages/api/rider/telegram/unbind.ts && git commit -m "$(cat <<'EOF'
feat: add rider telegram unbind flow
EOF
)"
```

## Self-review

- Spec coverage: 已覆盖骑手端按钮、站内解绑 API、即时本地回显、测试四项要求。
- Placeholder scan: 无 TBD / TODO / “类似前文” 占位描述。
- Type consistency: 前后端统一使用 `riderId` / `riderPhone` 入参，后端转发统一使用 `telegram_chat_id: ''`，前端本地状态统一写回 `telegramChatId: ''`。
