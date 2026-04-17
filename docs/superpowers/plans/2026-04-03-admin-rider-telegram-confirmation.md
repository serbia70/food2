# Admin Rider Telegram Confirmation Implementation Plan

> 状态说明（已过期）：本计划围绕 `rider-telegram-test` / 单骑手测试消息展开；当前生产树里这条运行时测试链已不存在，不应继续照此落实现代代码。
> 如需继续处理 dispatch / Telegram / rider/admin 同步，请改看 `docs/superpowers/specs/2026-04-15-dispatch-telegram-rider-admin-cleanup-design.md`。
> 文中的 `历史红灯预期：` 仅代表当时新增测试入口阶段的预期，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 admin 增加单骑手 Telegram 测试按钮，补齐派单/提醒失败透出，并让 admin 明确看到骑手已通过 Telegram 或骑手端确认接单。

**Architecture:** 复用现有 `/api/telegram/send`、`/api/admin/rider-assign`、`/api/admin/rider-dispatch` 与 `src/pages/api/telegram/rider-claim.ts`，不引入第二套协议。新增一个 admin 侧单骑手测试 API，前端继续按真实 shop 上下文发消息；同时把 `telegram_dispatch` / `telegram_notification` 的失败从 UI 层显式抛出，并微调 admin 文案把 `awaiting_courier` 解释为“待骑手确认”、`delivering` 解释为“已接单/派送中”。

**Tech Stack:** Astro API routes, TypeScript, node:test, existing Go backend `/api/telegram/send`

---

## File Structure

- Create: `src/pages/api/admin/rider-telegram-test.ts`
  - admin 店铺上下文下对单个骑手发 Telegram 测试消息
- Modify: `src/scripts/admin/settings-ui.ts`
  - 在骑手管理列表里渲染“测试 Telegram”按钮并处理点击反馈
- Modify: `src/components/admin/TabSettings.astro`
  - 为骑手管理区预留按钮说明或状态容器（若需要）
- Modify: `src/scripts/master/dispatch-actions.ts`
  - 让 `rider-dispatch` 的失败从 `telegram_dispatch` 提取并直接报错
- Modify: `src/components/admin/TabTables.astro`
  - 微调 `awaiting_courier`/`delivering` 中文提示
- Test: `src/pages/api/admin/rider-telegram-test.test.ts`
- Test: `src/scripts/admin/settings-ui.test.ts`
- Test: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Test: `src/tests/pages/admin/admin-order-status-copy.test.ts`

### Task 1: Admin 单骑手 Telegram 测试 API

**Files:**
- Create: `src/pages/api/admin/rider-telegram-test.ts`
- Test: `src/pages/api/admin/rider-telegram-test.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://food2.serbia70.com';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createCookies() {
  return {
    get(name: string) {
      if (name === 'admin_token') return { value: 'admin-token-1' };
      return undefined;
    },
  };
}

async function loadRoute() {
  return import('./rider-telegram-test.ts');
}

test('POST rider-telegram-test sends message to rider chat id through local telegram route', async () => {
  let telegramBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'http://localhost:3000/api/telegram/send') {
      telegramBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({
        shopSlug: 'demo-shop',
        riderName: '陈工',
        riderChatId: 'chat-123',
      }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, ok: true });
  assert.equal(telegramBody?.shopSlug, 'demo-shop');
  assert.equal(telegramBody?.chat_id, 'chat-123');
  assert.match(String(telegramBody?.text || ''), /陈工/);
});

test('POST rider-telegram-test rejects empty rider chat id', async () => {
  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost:3000/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'admin_token=admin-token-1' },
      body: JSON.stringify({ shopSlug: 'demo-shop', riderName: '陈工', riderChatId: '' }),
    }),
    cookies: createCookies(),
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'telegram_chat_id_missing',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/api/admin/rider-telegram-test.test.ts"`
历史红灯预期： with module-not-found or missing `POST` behavior.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { APIRoute } from 'astro';

export const prerender = false;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return json({ success: false, error: 'invalid_json' }, 400);

  const shopSlug = String(payload.shopSlug || '').trim();
  const riderName = String(payload.riderName || '骑手').trim() || '骑手';
  const riderChatId = String(payload.riderChatId || '').trim();

  if (!shopSlug) return json({ success: false, error: 'shop_slug_required' }, 400);
  if (!riderChatId) return json({ success: false, error: 'telegram_chat_id_missing' }, 400);

  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const telegramResponse = await fetch(new URL('/api/telegram/send', request.url).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {}),
      ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
    },
    body: JSON.stringify({
      shopSlug,
      chat_id: riderChatId,
      text: `Admin 骑手 Telegram 测试\n骑手：${riderName}\n时间：${now}`,
    }),
  });

  const text = await telegramResponse.text();
  return new Response(text, {
    status: telegramResponse.status,
    headers: { 'Content-Type': telegramResponse.headers.get('content-type') || 'application/json' },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/api/admin/rider-telegram-test.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/rider-telegram-test.ts src/pages/api/admin/rider-telegram-test.test.ts
git commit -m "feat: add admin rider telegram test api"
```

### Task 2: Admin 骑手列表按钮与错误反馈

**Files:**
- Modify: `src/scripts/admin/settings-ui.ts`
- Modify: `src/components/admin/TabSettings.astro`
- Test: `src/scripts/admin/settings-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('load-drivers renders telegram test action for bound riders only', async () => {
  document.body.innerHTML = `
    <div id="drivers-dispatch-summary"></div>
    <div id="drivers-list"></div>
  `;

  globalThis.fetch = async () => new Response(JSON.stringify({
    riders: [
      { name: '陈工', phone: '0613083899', status: 'available', telegramChatId: 'chat-1' },
      { name: '骑手B', phone: '0602', status: 'available', telegramChatId: '' },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  initSettingsUI(() => {});
  await (window as any).__adminHandlers['load-drivers']();

  const html = document.getElementById('drivers-list')!.innerHTML;
  assert.match(html, /测试 Telegram/);
  assert.match(html, /陈工/);
  assert.doesNotMatch(html, /骑手B[\s\S]*测试 Telegram/);
});

test('clicking rider telegram test action sends request and shows success toast', async () => {
  let calledBody: Record<string, unknown> | null = null;
  const messages: string[] = [];
  (window as any).showToast = (msg: string) => messages.push(msg);

  document.body.innerHTML = `
    <div id="drivers-dispatch-summary"></div>
    <div id="drivers-list"></div>
  `;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/rider/status')) {
      return new Response(JSON.stringify({
        riders: [{ name: '陈工', phone: '0613083899', status: 'available', telegramChatId: 'chat-1' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === '/api/admin/rider-telegram-test') {
      calledBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  initSettingsUI(() => {});
  await (window as any).__adminHandlers['load-drivers']();
  const button = document.querySelector('[data-admin-action="test-rider-telegram"]') as HTMLButtonElement;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calledBody?.riderName, '陈工');
  assert.equal(calledBody?.riderChatId, 'chat-1');
  assert.ok(messages.some((msg) => msg.includes('测试消息已发送')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/settings-ui.test.ts"`
历史红灯预期： because driver rows do not render any `test-rider-telegram` button.

- [ ] **Step 3: Write minimal implementation**

在 `src/scripts/admin/settings-ui.ts` 的 `load-drivers` 分支里，把已绑定 Telegram 的骑手渲染为：

```ts
const actionRow = document.createElement('div');
actionRow.style.cssText = 'margin-top:8px; display:flex; gap:8px;';

const testButton = document.createElement('button');
testButton.type = 'button';
testButton.dataset.adminAction = 'test-rider-telegram';
testButton.dataset.riderName = String(rider?.name || '骑手');
testButton.dataset.riderPhone = String(rider?.phone || '');
testButton.dataset.riderChatId = String(rider?.telegramChatId || '');
testButton.textContent = '测试 Telegram';
testButton.style.cssText = 'padding:6px 10px; border:none; border-radius:4px; background:#1976d2; color:#fff; cursor:pointer;';
actionRow.appendChild(testButton);
row.append(name, meta, ok, actionRow);
```

并新增按钮处理：

```ts
registerAdminGlobal('test-rider-telegram', async (el: HTMLElement) => {
  try {
    const runtime = getAdminRuntimeState();
    const shopSlug = String(runtime.shopSlug || '').trim();
    const riderName = String(el?.dataset?.riderName || '骑手').trim() || '骑手';
    const riderChatId = String(el?.dataset?.riderChatId || '').trim();
    if (!shopSlug) throw new Error('shop_slug_required');
    if (!riderChatId) throw new Error('telegram_chat_id_missing');

    const res = await fetch('/api/admin/rider-telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopSlug, riderName, riderChatId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new Error(String(data?.error || 'telegram test failed'));
    }
    showAdminToast(`测试消息已发送给 ${riderName}`);
  } catch (error) {
    showAdminToast(error instanceof Error ? error.message : 'Telegram 测试失败');
  }
}, false);
```

若 `TabSettings.astro` 需要额外说明文案，可追加：

```astro
<small style="color:#666; display:block; margin-top:8px;">已绑定 Telegram 的 available 骑手可直接发送测试消息，验证当前店铺实际通知链路。</small>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/settings-ui.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/admin/settings-ui.ts src/scripts/admin/settings-ui.test.ts src/components/admin/TabSettings.astro
git commit -m "feat: add admin rider telegram test action"
```

### Task 3: Master 提醒链路暴露 `telegram_dispatch` 失败

**Files:**
- Modify: `src/scripts/master/dispatch-actions.ts`
- Test: `src/tests/pages/master/master-dispatch-ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/tests/pages/master/master-dispatch-ui.test.ts` 追加：

```ts
test('master dispatch actions source surfaces telegram_dispatch failure details from remind api', async () => {
  const source = await readFile(dispatchActionsPath, 'utf8');

  assert.match(source, /const failedAttempt = Array\.isArray\(dispatchData\?\.telegram_dispatch\?\.attempts\)/);
  assert.match(source, /dispatchData\?\.telegram_dispatch\?\.failedCount > 0/);
  assert.match(source, /dispatchData\?\.telegram_dispatch\?\.skippedReason/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts"`
历史红灯预期： because `masterDispatchRepublish` currently ignores `telegram_dispatch.failedCount`.

- [ ] **Step 3: Write minimal implementation**

把 `masterDispatchRepublish` 的成功分支改成：

```ts
const failedAttempt = Array.isArray(dispatchData?.telegram_dispatch?.attempts)
  ? dispatchData.telegram_dispatch.attempts.find((item: { delivered?: boolean; error?: unknown }) => item?.delivered === false && String(item?.error || '').trim())
  : null;

if (dispatchData?.telegram_dispatch?.failedCount > 0) {
  throw new Error(String(
    failedAttempt?.error
      || dispatchData?.telegram_dispatch?.skippedReason
      || '再次催单失败'
  ));
}
```

保留成功时：

```ts
alert('已再次催单');
runtimeActionBindings.reloadPage();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/master/dispatch-actions.ts src/tests/pages/master/master-dispatch-ui.test.ts
git commit -m "fix: surface telegram dispatch failures in master actions"
```

### Task 4: Admin 文案明确“待骑手确认 / 派送中”

**Files:**
- Modify: `src/components/admin/TabTables.astro`
- Test: `src/tests/pages/admin/admin-order-status-copy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/pages/admin/admin-order-status-copy.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const filePath = resolve(process.cwd(), 'src/components/admin/TabTables.astro');

test('admin delivery cards label awaiting_courier as waiting rider confirmation', async () => {
  const source = await readFile(filePath, 'utf8');

  assert.match(source, /o\.status === 'awaiting_courier' \? '待骑手确认'/);
  assert.match(source, /o\.status === 'delivering' \? '骑手已接单'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/admin/admin-order-status-copy.test.ts"`
历史红灯预期： because current copy is `待骑手接单` / `派送中`.

- [ ] **Step 3: Write minimal implementation**

在 `src/components/admin/TabTables.astro` 调整：

```astro
{o.status === 'pending' ? '待处理' :
 o.status === 'confirmed' ? '已接单' :
 o.status === 'awaiting_courier' ? '待骑手确认' :
 o.status === 'delivering' ? '骑手已接单' : o.status}
```

保留现有 `o.courierName || o.courierPhone` 展示，不新增新字段。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/admin/admin-order-status-copy.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabTables.astro src/tests/pages/admin/admin-order-status-copy.test.ts
git commit -m "fix: clarify admin rider confirmation status copy"
```

### Task 5: 运行闭环回归

**Files:**
- Test: `src/pages/api/admin/rider-telegram-test.test.ts`
- Test: `src/scripts/admin/settings-ui.test.ts`
- Test: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Test: `src/tests/pages/admin/admin-order-status-copy.test.ts`
- Test: `src/tests/pages/api/admin-rider-assign.test.ts`
- Test: `src/lib/admin-rider-dispatch-route-spec.ts`
- Test: `src/lib/telegram-rider-claim-route-spec.ts`

- [ ] **Step 1: Run focused regression suite**

Run: `node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/api/admin/rider-telegram-test.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/settings-ui.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/master/master-dispatch-ui.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/admin/admin-order-status-copy.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/tests/pages/api/admin-rider-assign.test.ts" "D:/ai/food/.worktrees/260311/food2astro/src/lib/admin-rider-dispatch-route-spec.ts" "D:/ai/food/.worktrees/260311/food2astro/src/lib/telegram-rider-claim-route-spec.ts"`
Expected: PASS.

- [ ] **Step 2: Manual verification checklist**

Run these manual checks in dev:

```text
1. Admin → 设置 → 骑手管理 → 点击某个已绑定骑手的“测试 Telegram”
2. 骑手实际收到“Admin 骑手 Telegram 测试”消息
3. 触发待骑手确认订单，Telegram 消息出现“立即接单”
4. 骑手点击后，admin 订单状态变成“骑手已接单”并显示骑手姓名/电话
5. 若临时破坏 token/chat_id，admin 能看到真实失败提示而不是假成功
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/rider-telegram-test.ts src/pages/api/admin/rider-telegram-test.test.ts src/scripts/admin/settings-ui.ts src/scripts/admin/settings-ui.test.ts src/components/admin/TabSettings.astro src/scripts/master/dispatch-actions.ts src/tests/pages/master/master-dispatch-ui.test.ts src/components/admin/TabTables.astro src/tests/pages/admin/admin-order-status-copy.test.ts
git commit -m "feat: add admin rider telegram confirmation diagnostics"
```

## Self-Review

- Spec coverage:
  - admin 单骑手测试按钮：Task 1 + Task 2
  - 骑手确认接单复用现有链路：Task 4 + Task 5 验证
  - admin 看到已接单：Task 4
  - 失败透出：Task 2 + Task 3
- Placeholder scan:
  - 无 TBD/TODO；每个任务都给了精确文件、测试、命令、代码骨架。
- Type consistency:
  - 测试按钮统一使用 `riderChatId` / `riderName` / `shopSlug`
  - 广播失败统一读取 `telegram_dispatch.failedCount / attempts / skippedReason`
