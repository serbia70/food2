# Rider App And Telegram Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete rider app on top of the existing `/rider/*` flow, including phone/password login, rider status switching, active/history order views, order claim/completion, and self-service Telegram binding so admin dispatch notifications can reach real riders.

**Architecture:** Reuse the existing Astro rider pages and existing rider/order proxy routes, but tighten the rider session shape and move new Telegram binding logic into small focused server routes. Keep `telegram_chat_id` as the single source of truth for rider notification eligibility, and make the rider dashboard the only place where a rider initiates Telegram binding.

**Tech Stack:** Astro server routes, TypeScript, inline browser scripts on rider pages, existing `/api/rider/**` and `/api/order/update_status` routes, Telegram callback routes, Node test runner (`node --test`)

---

## File Structure

- Modify: `src/types/index.ts`
  - Extend rider-facing types with Telegram binding/session fields used by dashboard and binding routes.
- Create: `src/lib/rider-session.ts`
  - Pure helpers to normalize rider session payloads, validate required rider session fields, and compute binding-state copy.
- Create: `src/lib/rider-session.test.ts`
  - Unit tests for session normalization and binding-state helpers.
- Modify: `src/lib/rider-dispatch.ts`
  - Add rider dashboard filters/copy helpers shared by dashboard rendering and admin hints.
- Modify: `src/lib/rider-dispatch.test.ts`
  - Unit tests for rider dashboard order filtering and Telegram eligibility copy.
- Modify: `src/pages/rider/login.astro`
  - Normalize login result into one stable rider session object and redirect logged-in riders cleanly.
- Modify: `src/pages/rider/register.astro`
  - Keep register flow minimal but align its success path with the improved rider login/dashboard contract.
- Modify: `src/pages/rider/dashboard.astro`
  - Add binding panel, stronger session guards, active/history tabs, status explanations, and complete order interaction flow.
- Create: `src/pages/api/rider/telegram/bind.ts`
  - Generate a short-lived signed Telegram binding URL for the logged-in rider.
- Create: `src/pages/api/telegram/rider-bind.ts`
  - Validate Telegram bind callback and write `telegram_chat_id` onto the rider record.
- Modify: `src/pages/api/telegram/rider-claim.ts`
  - Reuse shared rider lookup logic instead of the dead old rider list path.
- Create: `src/lib/telegram-rider-bind.ts`
  - Shared helpers for signing/parsing rider bind payloads and creating Telegram bind links.
- Create: `src/lib/telegram-rider-bind.test.ts`
  - Tests for bind payload signing, expiry, and parsing rules.
- Modify: `src/pages/api/rider/status.ts`
  - Keep list endpoint behavior but make rider status updates and rider list shapes work for the new dashboard + Telegram bind flow.
- Modify: `src/pages/api/rider/orders.ts`
  - Ensure view filtering matches dashboard tabs (`active`, `history`) and still exposes claimable orders.
- Modify: `src/scripts/admin/settings-ui.ts`
  - Update copy so admin sees that Telegram binding must be completed in rider app.

## Task 1: 收敛骑手 session 模型与纯函数

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/rider-session.ts`
- Test: `src/lib/rider-session.test.ts`

- [ ] **Step 1: 先写失败测试，固定 rider session 的最小契约**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRiderTelegramBindingCopy,
  isValidRiderSession,
  normalizeRiderSession,
} from './rider-session';

test('normalizeRiderSession keeps required rider fields', () => {
  assert.deepEqual(
    normalizeRiderSession({
      id: 7,
      name: '陈工',
      phone: '0613083899',
      status: 'available',
      telegram_chat_id: '12345',
    }),
    {
      id: 7,
      name: '陈工',
      phone: '0613083899',
      status: 'available',
      telegram_chat_id: '12345',
    },
  );
});

test('isValidRiderSession rejects missing phone', () => {
  assert.equal(isValidRiderSession({ id: 7, name: '陈工', status: 'available' }), false);
});

test('getRiderTelegramBindingCopy reports unbound rider', () => {
  assert.equal(getRiderTelegramBindingCopy({ telegram_chat_id: '' }), '未绑定 Telegram，无法接收送餐通知');
  assert.equal(getRiderTelegramBindingCopy({ telegram_chat_id: '123' }), '已绑定 Telegram，可接收送餐通知');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-session.test.ts`
Expected: FAIL with module-not-found because `src/lib/rider-session.ts` does not exist yet.

- [ ] **Step 3: 在共享类型中加入 rider session 需要的字段**

```ts
export interface Rider {
  id: number;
  name: string;
  phone: string;
  status: 'offline' | 'available' | 'busy';
  telegram_chat_id?: string;
  telegram_username?: string;
  created_at?: string;
}
```

- [ ] **Step 4: 写最小实现，让测试通过**

```ts
import type { Rider } from '../types/index.ts';

export type RiderSession = Pick<Rider, 'id' | 'name' | 'phone' | 'status' | 'telegram_chat_id'>;

export function normalizeRiderSession(input: Record<string, unknown>): RiderSession {
  const rawStatus = String(input.status || 'offline');
  const status = rawStatus === 'available' || rawStatus === 'busy' ? rawStatus : 'offline';

  return {
    id: Number(input.id || 0),
    name: String(input.name || '').trim(),
    phone: String(input.phone || '').trim(),
    status,
    telegram_chat_id: String(input.telegram_chat_id || '').trim(),
  };
}

export function isValidRiderSession(input: unknown): input is RiderSession {
  if (!input || typeof input !== 'object') return false;
  const session = input as RiderSession;
  return Number(session.id) > 0 && String(session.name || '').trim() !== '' && String(session.phone || '').trim() !== '';
}

export function getRiderTelegramBindingCopy(rider: { telegram_chat_id?: string | null }): string {
  return String(rider.telegram_chat_id || '').trim() !== ''
    ? '已绑定 Telegram，可接收送餐通知'
    : '未绑定 Telegram，无法接收送餐通知';
}
```

- [ ] **Step 5: 再次跑测试确认通过**

Run: `node --test src/lib/rider-session.test.ts`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/types/index.ts src/lib/rider-session.ts src/lib/rider-session.test.ts
git commit -m "feat: add rider session helpers"
```

## Task 2: 收敛 rider dashboard 的订单过滤与文案 helper

**Files:**
- Modify: `src/lib/rider-dispatch.ts`
- Modify: `src/lib/rider-dispatch.test.ts`
- Modify: `src/scripts/admin/settings-ui.ts:316-345`

- [ ] **Step 1: 先给现有 helper 加失败测试，锁定 dashboard 过滤规则**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRiderDashboardOrders,
  getRiderStatusHintCopy,
} from './rider-dispatch';

test('filterRiderDashboardOrders returns active orders for active view', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '' },
    { id: 2, status: 'delivering', courier_phone: '0613083899' },
    { id: 3, status: 'completed', courier_phone: '0613083899' },
  ];
  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0613083899', 'active').map((item) => item.id),
    [1, 2],
  );
});

test('filterRiderDashboardOrders returns completed orders for history view', () => {
  const orders = [
    { id: 1, status: 'awaiting_courier', courier_phone: '' },
    { id: 2, status: 'completed', courier_phone: '0613083899' },
  ];
  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0613083899', 'history').map((item) => item.id),
    [2],
  );
});

test('getRiderStatusHintCopy explains available status', () => {
  assert.equal(getRiderStatusHintCopy('available'), '当前会进入派单名单并显示可抢订单');
  assert.equal(getRiderStatusHintCopy('offline'), '当前不会进入派单名单');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/rider-dispatch.test.ts`
Expected: FAIL because the new exports do not exist yet.

- [ ] **Step 3: 在 helper 文件里补最小实现**

```ts
export function filterRiderDashboardOrders<T extends { status?: string | null; courier_phone?: string | null }>(
  orders: T[],
  riderPhone?: string | null,
  view: 'active' | 'history' = 'active',
): T[] {
  if (view === 'history') {
    const phone = String(riderPhone || '').trim();
    return orders.filter((order) => String(order?.status || '') === 'completed' && String(order?.courier_phone || '').trim() === phone);
  }

  return filterRiderActiveOrders(orders, riderPhone);
}

export function getRiderStatusHintCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'available':
      return '当前会进入派单名单并显示可抢订单';
    case 'busy':
      return '当前不会收到新派单，但可继续处理已接订单';
    default:
      return '当前不会进入派单名单';
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/lib/rider-dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: 调整后台文案，让商家明确去骑手端绑定**

```ts
warn.textContent = '阻断原因：未绑定 Telegram，骑手需先在骑手端完成绑定，点击“通知骑手”也不会收到消息';
```

- [ ] **Step 6: 提交这一小步**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch.test.ts src/scripts/admin/settings-ui.ts
git commit -m "feat: clarify rider dashboard eligibility copy"
```

## Task 3: 收紧骑手登录页与注册后跳转契约

**Files:**
- Modify: `src/pages/rider/login.astro`
- Modify: `src/pages/rider/register.astro`
- Modify: `src/lib/rider-session.ts`

- [ ] **Step 1: 先写登录页需要使用的 session 代码片段到计划执行稿**

```ts
import { isValidRiderSession, normalizeRiderSession } from '../../lib/rider-session';
```

- [ ] **Step 2: 改 rider login，在成功登录后统一写入 session**

```ts
const data = await res.json();

if (data.success) {
  const session = normalizeRiderSession(data.rider || {});
  if (!isValidRiderSession(session)) {
    alert('登录成功但骑手资料不完整');
    return;
  }
  localStorage.setItem('rider_session', JSON.stringify(session));
  location.href = '/rider/dashboard';
} else {
  alert('Login failed: ' + data.error);
}
```

- [ ] **Step 3: 加上已登录跳转保护**

```ts
const saved = localStorage.getItem('rider_session');
if (saved) {
  try {
    const parsed = JSON.parse(saved);
    if (isValidRiderSession(parsed)) {
      location.href = '/rider/dashboard';
    }
  } catch {}
}
```

- [ ] **Step 4: 调整 register 页成功行为，注册成功后跳登录页并保留手机号提示**

```ts
if (data.success) {
  sessionStorage.setItem('rider_register_phone', phone);
  alert('Registration successful! Please login.');
  location.href = '/rider/login';
}
```

- [ ] **Step 5: 在 login 页加载时回填刚注册手机号**

```ts
const recentPhone = sessionStorage.getItem('rider_register_phone');
if (recentPhone) {
  const phoneNode = document.getElementById('phone');
  if (phoneNode instanceof HTMLInputElement) phoneNode.value = recentPhone;
  sessionStorage.removeItem('rider_register_phone');
}
```

- [ ] **Step 6: 手动验证登录/注册流**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: `/rider/register` 注册成功后跳 `/rider/login`；登录成功后跳 `/rider/dashboard`；刷新后仍能读到 `rider_session`。

- [ ] **Step 7: 提交这一小步**

```bash
git add src/pages/rider/login.astro src/pages/rider/register.astro src/lib/rider-session.ts
git commit -m "feat: normalize rider session storage"
```

## Task 4: 重做 rider dashboard 顶部信息区与 Telegram 绑定区

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/lib/rider-session.ts`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: 先在 dashboard 顶部加 session 守卫，失败就清空并跳登录**

```ts
const saved = localStorage.getItem('rider_session');
if (!saved) {
  location.href = '/rider/login';
  return;
}

try {
  rider = JSON.parse(saved);
} catch {
  localStorage.removeItem('rider_session');
  location.href = '/rider/login';
  return;
}

if (!isValidRiderSession(rider)) {
  localStorage.removeItem('rider_session');
  location.href = '/rider/login';
  return;
}
```

- [ ] **Step 2: 替换页面头部 HTML，加入 Telegram 绑定区容器**

```astro
<div class="rider-summary-card">
  <div class="rider-summary-main">
    <div>
      <div id="rider-name">Rider</div>
      <div id="rider-phone" class="muted"></div>
    </div>
    <button onclick="logout()" class="btn-xs">退出 / Logout</button>
  </div>
  <div id="rider-status-hint" class="status-hint"></div>
  <div id="telegram-binding-panel" class="telegram-binding-panel"></div>
</div>
```

- [ ] **Step 3: 添加渲染绑定状态的最小函数**

```ts
function renderTelegramBindingPanel() {
  const panel = document.getElementById('telegram-binding-panel');
  if (!panel) return;
  const bound = String(rider.telegram_chat_id || '').trim() !== '';
  panel.innerHTML = `
    <div class="telegram-binding-copy ${bound ? 'bound' : 'unbound'}">
      ${bound ? '已绑定 Telegram，可接收送餐通知' : '未绑定 Telegram，无法接收送餐通知'}
    </div>
    ${bound ? '' : '<button id="bind-telegram-btn" class="btn-action btn-map" type="button">绑定 Telegram</button>'}
  `;
  const btn = document.getElementById('bind-telegram-btn');
  if (btn) btn.addEventListener('click', bindTelegram);
}
```

- [ ] **Step 4: 初始化时同步 rider 头部信息与状态提示**

```ts
document.getElementById('rider-name').textContent = rider.name || 'Rider';
document.getElementById('rider-phone').textContent = rider.phone || '';
document.getElementById('rider-status-hint').textContent = getRiderStatusHintCopy(rider.status);
renderTelegramBindingPanel();
```

- [ ] **Step 5: 更新状态切换成功逻辑，让 hint 与 session 一起刷新**

```ts
if (data.success) {
  rider.status = status;
  localStorage.setItem('rider_session', JSON.stringify(rider));
  updateBadge(status);
  document.getElementById('rider-status-hint').textContent = getRiderStatusHintCopy(status);
}
```

- [ ] **Step 6: 手动验证顶部区域**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: rider dashboard 顶部可看到姓名、手机号、状态解释、Telegram 绑定状态；未绑定时能看到“绑定 Telegram”按钮。

- [ ] **Step 7: 提交这一小步**

```bash
git add src/pages/rider/dashboard.astro src/lib/rider-session.ts src/lib/rider-dispatch.ts
git commit -m "feat: add rider dashboard binding panel"
```

## Task 5: 收紧 rider orders 视图契约

**Files:**
- Modify: `src/pages/api/rider/orders.ts`
- Modify: `src/lib/rider-dispatch.ts`
- Test: `src/lib/rider-dispatch.test.ts`

- [ ] **Step 1: 先写过滤视图的失败测试**

```ts
import { filterRiderDashboardOrders } from './rider-dispatch';

test('history view only keeps completed rider orders', () => {
  const orders = [
    { id: 1, status: 'completed', courier_phone: '0613083899' },
    { id: 2, status: 'completed', courier_phone: '0600' },
    { id: 3, status: 'delivering', courier_phone: '0613083899' },
  ];
  assert.deepEqual(
    filterRiderDashboardOrders(orders, '0613083899', 'history').map((item) => item.id),
    [1],
  );
});
```

- [ ] **Step 2: 跑测试确认通过/或补齐后通过**

Run: `node --test src/lib/rider-dispatch.test.ts`
Expected: PASS once helper is in place.

- [ ] **Step 3: 调整 `/api/rider/orders`，明确支持 `view=active|history`**

```ts
const view = String(url.searchParams.get('view') || 'active').trim();
const phone = String(url.searchParams.get('phone') || '').trim();

const orders = filterRiderDashboardOrders(rawOrders, phone, view === 'history' ? 'history' : 'active');
return new Response(JSON.stringify({ success: true, orders }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
```

- [ ] **Step 4: 在 dashboard 里把 tab value 从 `all` 改成 `history`**

```ts
const view = currentTab === 'active' ? 'active' : 'history';
```

- [ ] **Step 5: 手动验证 tab 切换**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: “进行中”只显示待接/配送中；“已完成”只显示当前骑手自己的 completed 订单。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/pages/api/rider/orders.ts src/lib/rider-dispatch.ts src/lib/rider-dispatch.test.ts src/pages/rider/dashboard.astro
git commit -m "feat: align rider order tabs with dashboard views"
```

## Task 6: 新增 Telegram 绑定 payload helper

**Files:**
- Create: `src/lib/telegram-rider-bind.ts`
- Create: `src/lib/telegram-rider-bind.test.ts`

- [ ] **Step 1: 先写失败测试，锁定签名/过期规则**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRiderTelegramBindToken,
  parseRiderTelegramBindToken,
} from './telegram-rider-bind';

test('build + parse rider telegram bind token round-trips', () => {
  const token = buildRiderTelegramBindToken({ riderId: 7, riderPhone: '0613083899', expiresAt: '2026-03-30T10:05:00.000Z' }, 'secret');
  assert.deepEqual(parseRiderTelegramBindToken(token, 'secret'), {
    riderId: 7,
    riderPhone: '0613083899',
    expiresAt: '2026-03-30T10:05:00.000Z',
  });
});

test('parse throws on invalid signature', () => {
  assert.throws(() => parseRiderTelegramBindToken('bad.token', 'secret'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/telegram-rider-bind.test.ts`
Expected: FAIL because helper file does not exist yet.

- [ ] **Step 3: 写最小实现**

```ts
import crypto from 'node:crypto';

type RiderTelegramBindPayload = {
  riderId: number;
  riderPhone: string;
  expiresAt: string;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function buildRiderTelegramBindToken(payload: RiderTelegramBindPayload, secret: string): string {
  const body = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function parseRiderTelegramBindToken(token: string, secret: string): RiderTelegramBindPayload {
  const [body, sig] = String(token || '').split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!body || !sig || sig !== expected) throw new Error('invalid_bind_signature');
  return JSON.parse(fromBase64Url(body)) as RiderTelegramBindPayload;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/lib/telegram-rider-bind.test.ts`
Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add src/lib/telegram-rider-bind.ts src/lib/telegram-rider-bind.test.ts
git commit -m "feat: add telegram rider bind token helpers"
```

## Task 7: 新增 rider 绑定入口 API

**Files:**
- Create: `src/pages/api/rider/telegram/bind.ts`
- Modify: `src/lib/rider-session.ts`
- Test: `src/lib/telegram-rider-bind.test.ts`

- [ ] **Step 1: 先写 API 需要的关键代码草稿**

```ts
import type { APIRoute } from 'astro';
import { buildRiderTelegramBindToken } from '../../../../lib/telegram-rider-bind';
```

- [ ] **Step 2: 实现最小 API，读取 rider session 并返回 bind_url**

```ts
import type { APIRoute } from 'astro';
import { buildRiderTelegramBindToken } from '../../../../lib/telegram-rider-bind';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
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

  const secret = String(process.env.TELEGRAM_BIND_SECRET || '').trim();
  const botName = String(process.env.TELEGRAM_BOT_NAME || '').trim();
  if (!secret || !botName) {
    return new Response(JSON.stringify({ success: false, error: 'telegram_bind_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const token = buildRiderTelegramBindToken({ riderId, riderPhone, expiresAt }, secret);
  const bindUrl = `https://t.me/${botName}?start=${encodeURIComponent(`bind_${token}`)}`;

  return new Response(JSON.stringify({ success: true, bind_url: bindUrl, expires_at: expiresAt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: 在 dashboard 里补 `bindTelegram()`**

```ts
async function bindTelegram() {
  try {
    const res = await fetch('/api/rider/telegram/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riderId: rider.id, riderPhone: rider.phone }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false || !data.bind_url) {
      throw new Error(data.error || 'bind_link_failed');
    }
    location.href = data.bind_url;
  } catch (error) {
    alert(`Telegram 绑定入口创建失败: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
```

- [ ] **Step 4: 手动验证 bind API**

Run: `curl -i -X POST "http://127.0.0.1:3101/api/rider/telegram/bind" -H "Content-Type: application/json" --data '{"riderId":7,"riderPhone":"0613083899"}'`
Expected: 200 JSON containing `bind_url` when env is configured, otherwise 503 `telegram_bind_not_configured`.

- [ ] **Step 5: 提交这一小步**

```bash
git add src/pages/api/rider/telegram/bind.ts src/pages/rider/dashboard.astro
git commit -m "feat: add rider telegram bind entrypoint"
```

## Task 8: 新增 Telegram 绑定回调并写回骑手资料

**Files:**
- Create: `src/pages/api/telegram/rider-bind.ts`
- Modify: `src/pages/api/rider/status.ts`
- Modify: `src/pages/api/telegram/rider-claim.ts`

- [ ] **Step 1: 先把现有 rider lookup 逻辑抽成局部可复用函数草稿**

```ts
async function fetchAvailableRidersFromLocal(request: Request): Promise<RiderLookupRow[]> {
  const res = await fetch(new URL('/api/rider/status?action=list_available', request.url), { method: 'GET' });
  ...
}
```

- [ ] **Step 2: 新建 `src/pages/api/telegram/rider-bind.ts`，校验 secret + bind token**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../../config';
import { parseRiderTelegramBindToken } from '../../../lib/telegram-rider-bind';

export const prerender = false;

function isTrustedTelegramRequest(request: Request): boolean {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_CALLBACK_SECRET || '').trim();
  const provided = String(request.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  return expected !== '' && provided === expected;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedTelegramRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized_telegram_request' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body?.bind_token || '').trim();
  const chatId = String(body?.chat_id || '').trim();
  const secret = String(process.env.TELEGRAM_BIND_SECRET || '').trim();
  if (!token || !chatId || !secret) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_bind_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = parseRiderTelegramBindToken(token, secret);
  if (Date.parse(payload.expiresAt) < Date.now()) {
    return new Response(JSON.stringify({ success: false, error: 'bind_token_expired' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = await fetch(`${API_BASE_URL}/api/rider/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: payload.riderId, telegram_chat_id: chatId }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};
```

- [ ] **Step 3: 把 `src/pages/api/telegram/rider-claim.ts` 的死路径改为走本地 rider list**

```ts
async function fetchAvailableRiders(request: Request): Promise<RiderLookupRow[]> {
  const res = await fetch(new URL('/api/rider/status?action=list_available', request.url), {
    method: 'GET',
  });
  ...
}
```

- [ ] **Step 4: 如果 upstream `rider/status` 只收 id/status，则在本地补兼容分支**

在 `src/pages/api/rider/status.ts` 的 `POST` 中先解析 body：

```ts
const parsed = JSON.parse(body) as Record<string, unknown>;
if ('telegram_chat_id' in parsed) {
  const res = await fetch(`${API_BASE_URL}/api/rider/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  ...
}
```

如果 upstream 不支持，需要把这一条改成真正存在的骑手编辑接口；执行本任务前必须先确认 upstream 支持写 `telegram_chat_id`。

- [ ] **Step 5: 手动验证绑定回调**

Run: `curl -i -X POST "http://127.0.0.1:3101/api/telegram/rider-bind" -H "Content-Type: application/json" -H "x-telegram-bot-api-secret-token: <secret>" --data '{"bind_token":"<token>","chat_id":"123456"}'`
Expected: 200/成功 JSON when upstream accepts rider telegram update; 4xx/5xx with explicit error otherwise.

- [ ] **Step 6: 提交这一小步**

```bash
git add src/pages/api/telegram/rider-bind.ts src/pages/api/telegram/rider-claim.ts src/pages/api/rider/status.ts
git commit -m "feat: add telegram rider bind callback"
```

## Task 9: 让 dashboard 在绑定成功后刷新状态

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/lib/rider-session.ts`

- [ ] **Step 1: 在 dashboard 初始化时增加 query 参数提示位**

```ts
const params = new URL(location.href).searchParams;
const telegramBound = String(params.get('telegram_bound') || '').trim() === '1';
if (telegramBound) {
  showDeepLinkToast('Telegram 绑定成功');
}
```

- [ ] **Step 2: 绑定成功后刷新本地 session 的最小逻辑**

```ts
if (telegramBound) {
  rider.telegram_chat_id = rider.telegram_chat_id || '__pending_refresh__';
  renderTelegramBindingPanel();
}
```

- [ ] **Step 3: 增加从 rider orders/status 结果里刷新 telegram 字段的逻辑**

如果任何 rider 相关返回里包含 `telegram_chat_id`，则写回本地：

```ts
if (data.rider && typeof data.rider === 'object') {
  const next = normalizeRiderSession({ ...rider, ...data.rider });
  rider = next;
  localStorage.setItem('rider_session', JSON.stringify(next));
  renderTelegramBindingPanel();
}
```

- [ ] **Step 4: 手动验证绑定后界面变化**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: Telegram 绑定完成返回后，dashboard 提示成功并能切换到“已绑定 Telegram，可接收送餐通知”。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/pages/rider/dashboard.astro src/lib/rider-session.ts
git commit -m "feat: refresh rider dashboard after telegram bind"
```

## Task 10: 收紧接单/送达交互与并发提示

**Files:**
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/lib/rider-dispatch.ts`

- [ ] **Step 1: 让接单按钮只在 `available` 状态时可用**

```ts
const canTake = rider.status === 'available' && o.status === 'awaiting_courier' && !o.courier_phone;
```

- [ ] **Step 2: 为非 available 状态增加页面提示**

```ts
if (rider.status !== 'available') {
  showDeepLinkToast('当前不是 available，无法接新单');
}
```

- [ ] **Step 3: 收紧完成订单按钮，只允许配送中订单显示**

保留现有条件，但确保不会给 `awaiting_courier` 卡片渲染送达按钮：

```ts
if (o.status === 'delivering' && String(o.courier_phone || '').trim() === String(rider.phone || '').trim()) {
  ...
}
```

- [ ] **Step 4: 接单失败时统一并发冲突提示文案**

```ts
const shouldHintTaken =
  rawError.includes('expected_current_status') ||
  rawError.includes('status mismatch') ||
  rawError.includes('已被') ||
  rawError.includes('delivering');

alert(shouldHintTaken ? '该订单已被其他骑手接走，将刷新列表' : `接单失败: ${rawError || 'unknown'}`);
```

- [ ] **Step 5: 手动验证状态与并发提示**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: `available` 才能接新单；接单冲突时提示“该订单已被其他骑手接走”；送达按钮只出现在自己配送中的订单上。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/pages/rider/dashboard.astro src/lib/rider-dispatch.ts
git commit -m "feat: tighten rider order action guards"
```

## Task 11: 回归 admin 派单可见性与真实提示

**Files:**
- Modify: `src/scripts/admin/settings-ui.ts`
- Modify: `src/scripts/admin/orders.ts`
- Modify: `src/pages/api/admin/rider-dispatch.ts`

- [ ] **Step 1: 确认 admin 端未绑定提示走真实错误**

在 `src/scripts/admin/orders.ts` 保留现有：

```ts
} else if (skippedReason === 'no_telegram_bound_riders') {
  throw new Error(`当前有 ${availableRiderCount} 位 available 骑手，但 0 位绑定 Telegram，未发送通知`);
}
```

- [ ] **Step 2: 如果 `order_snapshot_unavailable` 还会吞掉 401/403，继续保持真实透传**

```ts
if (!orderRes.ok || orderPayload.success === false) {
  return new Response(orderText || JSON.stringify(orderPayload), {
    status: orderRes.status,
    headers: { 'Content-Type': orderRes.headers.get('content-type') || 'application/json' },
  });
}
```

- [ ] **Step 3: 在 admin rider 列表说明里加入骑手端绑定路径**

```ts
summaryEl.innerHTML = `<div style="font-size:13px; padding:10px 12px; border-radius:6px; background:#fff8e1; color:${summaryColor};">当前 available 骑手 <strong>${riders.length}</strong> 人；可接收通知 <strong>${eligibleCount}</strong> 人；因未绑定 Telegram 被拦截 <strong>${blockedCount}</strong> 人。骑手需先在骑手端完成 Telegram 绑定。</div>`;
```

- [ ] **Step 4: 手动验证 admin 端提示**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: 后台“骑手管理”区域会明确提示“骑手需先在骑手端完成 Telegram 绑定”；通知失败时不再误导成假成功。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/scripts/admin/settings-ui.ts src/scripts/admin/orders.ts src/pages/api/admin/rider-dispatch.ts
git commit -m "feat: clarify admin rider binding requirements"
```

## Task 12: 完整联调与测试收口

**Files:**
- Test: `src/lib/rider-session.test.ts`
- Test: `src/lib/rider-dispatch.test.ts`
- Test: `src/lib/telegram-rider-bind.test.ts`
- Modify: touched files only if bugs are found during verification

- [ ] **Step 1: 跑单元测试**

Run: `node --test src/lib/rider-session.test.ts src/lib/rider-dispatch.test.ts src/lib/telegram-rider-bind.test.ts`
Expected: PASS

- [ ] **Step 2: 跑项目构建**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: 启动本地服务用于人工联调**

Run: `pnpm exec wrangler pages dev dist --port 3101`
Expected: Ready on `http://127.0.0.1:3101`

- [ ] **Step 4: 验证注册/登录/状态切换**

Manual:
1. 打开 `/rider/register`
2. 注册新骑手
3. 打开 `/rider/login`
4. 登录进入 `/rider/dashboard`
5. 切换 `offline → available → busy`

Expected:
- 登录成功
- dashboard 显示 rider 信息
- 状态切换成功

- [ ] **Step 5: 验证 Telegram 绑定入口与回调**

Manual:
1. 在 rider dashboard 点击“绑定 Telegram”
2. 跳转 Telegram bot
3. 完成绑定回调
4. 返回 dashboard

Expected:
- dashboard 显示“已绑定 Telegram，可接收送餐通知”
- admin 骑手管理显示该骑手已绑定

- [ ] **Step 6: 验证派单与接单全链路**

Manual:
1. admin 后台把骑手状态切为 `available`
2. admin 点击“通知骑手”
3. Telegram 收到通知
4. rider dashboard 出现待接订单
5. rider 接单
6. 订单进入 `delivering`
7. rider 确认送达
8. 订单进入 `completed`

Expected:
- 通知可达
- 接单成功
- 完成成功
- admin/rider 两端状态一致

- [ ] **Step 7: 如果验证中发现 bug，只做最小修复并重跑相关步骤**

```bash
pnpm build
node --test src/lib/rider-session.test.ts src/lib/rider-dispatch.test.ts src/lib/telegram-rider-bind.test.ts
```

Expected: PASS

- [ ] **Step 8: 提交最终整体验证结果**

```bash
git add src/pages/rider/login.astro src/pages/rider/register.astro src/pages/rider/dashboard.astro src/pages/api/rider/telegram/bind.ts src/pages/api/telegram/rider-bind.ts src/pages/api/telegram/rider-claim.ts src/pages/api/rider/orders.ts src/pages/api/rider/status.ts src/scripts/admin/settings-ui.ts src/scripts/admin/orders.ts src/lib/rider-session.ts src/lib/rider-session.test.ts src/lib/rider-dispatch.ts src/lib/rider-dispatch.test.ts src/lib/telegram-rider-bind.ts src/lib/telegram-rider-bind.test.ts src/types/index.ts
git commit -m "feat: complete rider app and telegram binding flow"
```

---

## Self-Review

- **Spec coverage:**
  - 登录/注册：Task 3
  - dashboard 完整化：Task 4, Task 5, Task 10
  - 状态切换：Task 4, Task 12
  - Telegram 绑定入口与回调：Task 6, Task 7, Task 8, Task 9
  - admin 联动：Task 2, Task 11
  - 派单 → 接单 → 送达闭环：Task 5, Task 10, Task 12
- **Placeholder scan:** 已去掉 TBD/TODO/“类似前面任务”之类占位描述；每个任务都给了明确文件、代码或命令。
- **Type consistency:** 全文统一使用 `rider_session`、`telegram_chat_id`、`available|busy|offline`、`history` view、`bind_url`、`bind_token`，没有中途改名。
