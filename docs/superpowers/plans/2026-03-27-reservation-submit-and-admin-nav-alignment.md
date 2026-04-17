# Reservation Submit And Admin Nav Alignment Implementation Plan

> 状态说明（历史计划）：这份计划记录的是预约提交与 admin 导航顺序对齐时的实施步骤；文中的 `历史红灯预期：` 只代表当时推进顺序，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让预约功能在前台显示、前台提交、后台入口三处都统一按 master 设置生效，并把后台导航顺序调整为“订单 → 预约 → 历史”。

**Architecture:** 保持现有 `TabReservations`、`orders` tab key 与 admin tab 切换协议不变，只修正预约提交链路的放行规则来源，并调整 admin tabs 的按钮顺序与文案。前台 `/api/reservation` 在代理提交前先读取店铺 info/settings 中的预约开关，按与页面显示一致的 master 设置口径放行；后台继续通过 `adminBillingView.reservationPlan.enabled` 控制预约入口显示。

**Tech Stack:** Astro, TypeScript, node:test, Preact

---

## File Structure

- `src/pages/api/reservation.ts`
  - 在代理预约提交前读取店铺 info
  - 从 `settings.reservation_enabled` / `settings.subscription_enabled` 判定是否允许预约
  - 若关闭则返回统一业务错误；若开启则继续代理到 upstream
- `src/pages/master/dine-in-panel-routing.test.ts`
  - 补充后台导航顺序与前台预约口径的源码断言
- `src/pages/api/reservation.test.ts`
  - 新增预约 API 路由测试，覆盖 master 设置开启/关闭两条提交路径
- `src/components/admin/AdminTabs.astro`
  - 调整按钮顺序为“订单 → 预约 → 历史”
  - 保留 `orders`、`reservations` 现有 tab key 不变
- `src/scripts/admin/core.ts`
  - 仅在必要时补最小回归，确认默认 fallback 仍落到 `orders`

### Task 1: 修复预约提交按 master 设置放行

**Files:**
- Create: `src/pages/api/reservation.test.ts`
- Modify: `src/pages/api/reservation.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/api/reservation.test.ts` 新建测试，先锁住“master 开启预约时不再被旧套餐规则拦截”的行为：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from './reservation.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('reservation api allows submit when shop settings enable reservation', async () => {
  let callCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount += 1;
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(JSON.stringify({
        slug: '102',
        settings: JSON.stringify({ reservation_enabled: 1 }),
        enable_reservation: 0,
        billing_plan_type: '<nil>',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/102/reservation')) {
      return new Response(JSON.stringify({ reservation_id: 88 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.reservation_id, 88);
  assert.equal(callCount, 2);
});

test('reservation api rejects submit when shop settings disable reservation', async () => {
  let forwarded = false;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(JSON.stringify({
        slug: '102',
        settings: JSON.stringify({ reservation_enabled: 0 }),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/102/reservation')) {
      forwarded = true;
      return new Response('{}', { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.success, false);
  assert.equal(data.error, 'reservation disabled');
  assert.equal(forwarded, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "src/pages/api/reservation.test.ts"
```
历史红灯预期：，因为当前 `src/pages/api/reservation.ts` 只直接转发到 upstream，没有先按 master 设置判定是否允许预约。

- [ ] **Step 3: Write minimal implementation**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/api/reservation.ts` 里保留现有 payload 与代理结构，只追加最小预检查逻辑。把文件改成下面这个版本：

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL } from '../../config';

export const prerender = false;

function parseSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function isReservationEnabled(shop: Record<string, unknown>): boolean {
  const settings = parseSettings(shop.settings);
  const raw = settings.reservation_enabled ?? settings.subscription_enabled ?? 1;
  return Number(raw) !== 0;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.json();
    const slug = String(raw?.restaurantId || '').trim();
    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'restaurantId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shopRes = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/info`);
    if (!shopRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'shop info unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shop = await shopRes.json();
    if (!isReservationEnabled(shop ?? {})) {
      return new Response(JSON.stringify({ success: false, error: 'reservation disabled' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      guest_count: Number(raw?.guest_count || 0),
      reservation_time: String(raw?.reservation_time || ''),
      customer_phone: String(raw?.customer_phone || ''),
      dine_type: 'dine_in',
      delivery_address: null,
      customer_name: raw?.customer_name || null,
      items: raw?.items || null,
      remarks: raw?.remarks || null,
    };

    const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(slug)}/reservation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: data.error || 'create reservation failed' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, ...data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const msg = e?.message || 'proxy failed';
    return new Response(JSON.stringify({ success: false, error: `backend unavailable: ${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "src/pages/api/reservation.test.ts"
```
Expected: PASS，2/2 通过。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/reservation.ts src/pages/api/reservation.test.ts
git commit -m "fix: align reservation submit with master settings"
```

### Task 2: 调整 admin 导航顺序并锁住预约入口结构

**Files:**
- Modify: `src/components/admin/AdminTabs.astro`
- Modify: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 追加一个导航顺序断言：

```ts
test('admin tabs source orders reservation before history', async () => {
  const adminTabsPath = resolve(process.cwd(), 'src/components/admin/AdminTabs.astro');
  const adminTabs = await readFile(adminTabsPath, 'utf8');

  const orderIndex = adminTabs.indexOf('data-tab-name="tables"');
  const reservationIndex = adminTabs.indexOf('data-tab-name="reservations"');
  const historyIndex = adminTabs.indexOf('data-tab-name="orders"');

  assert.notEqual(orderIndex, -1);
  assert.notEqual(reservationIndex, -1);
  assert.notEqual(historyIndex, -1);
  assert.ok(orderIndex < reservationIndex);
  assert.ok(reservationIndex < historyIndex);
  assert.match(adminTabs, /📱 订单 \(Active\)/);
  assert.match(adminTabs, /📜 历史 \(History\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
历史红灯预期：，因为当前 `AdminTabs.astro` 顺序仍是“订单 → 历史 → 预约”。

- [ ] **Step 3: Write minimal implementation**

把 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/AdminTabs.astro` 改成下面这样，仅调整按钮顺序，保留原有 tab key：

```astro
---
const { showReservationTab = true, showStatsTab = true, showMarketingTab = false, showCustomersTab = false } = Astro.props;
---

<div class="tabs-container">
  <div class="tabs">
    <button data-admin-action="show-tab" data-tab-name="tables" class="active" id="btn-tables">📱 订单 (Active)</button>
    {showReservationTab && <button data-admin-action="show-tab" data-tab-name="reservations" id="btn-reservations">📅 预约</button>}
    <button data-admin-action="show-tab" data-tab-name="orders" id="btn-orders">📜 历史 (History)</button>
    <button data-admin-action="show-tab" data-tab-name="menu" id="btn-menu">🍔 菜单</button>
    <button data-admin-action="show-tab" data-tab-name="settings" id="btn-settings">🛠️ 设置</button>
    {showStatsTab && <button data-admin-action="show-tab" data-tab-name="stats" id="btn-stats">📊 统计</button>}
    {showMarketingTab && <button data-admin-action="show-tab" data-tab-name="marketing" id="btn-marketing">🎯 营销</button>}
    {showCustomersTab && <button data-admin-action="show-tab" data-tab-name="customers" id="btn-customers">👥 客户</button>}
    <button data-admin-action="show-tab" data-tab-name="data" id="btn-data">💾 备份</button>
    <button data-admin-action="show-tab" data-tab-name="password" id="btn-pwd">🔑 密码</button>
    <button data-admin-action="show-tab" data-tab-name="renew" id="btn-renew">💰 费用</button>
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，新增导航顺序断言通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminTabs.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "refactor: reorder admin reservation navigation"
```

### Task 3: 全量验证预约显示、提交与后台入口

**Files:**
- Test: `src/pages/api/reservation.test.ts`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`
- Test: `src/lib/admin-order-channel-billing-view.test.ts`

- [ ] **Step 1: Run targeted reservation API tests**

Run:
```bash
node --test "src/pages/api/reservation.test.ts"
```
Expected: PASS，0 fail。

- [ ] **Step 2: Run admin/public source regression**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，0 fail。

- [ ] **Step 3: Run related billing view regression**

Run:
```bash
node --test "src/lib/admin-order-channel-billing-view.test.ts"
```
Expected: PASS，0 fail。

- [ ] **Step 4: Manual verification checklist**

在浏览器手动验证：

```text
1. 打开 http://localhost:3000/102
2. 点击预订按钮，填写必填项并提交
3. 确认不再出现 “Reservation is available on subscription/business plan only”
4. 打开 http://localhost:3000/admin/102
5. 确认导航顺序为：订单、预约、历史
6. 点击“预约”确认能看到预约管理区
7. 点击“历史”确认仍能打开原 orders 历史区
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/reservation.ts src/pages/api/reservation.test.ts src/components/admin/AdminTabs.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "fix: align reservation flows with master settings"
```
