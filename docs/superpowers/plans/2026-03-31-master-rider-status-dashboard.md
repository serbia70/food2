# Master 骑手状态看板 Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 master 骑手状态看板引入时的实施步骤；文中的 `历史红灯预期：` 只代表当时页面接线阶段，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 master 中新增独立“骑手状态”tab，集中展示平台骑手的状态、进行中订单、代收信息与配送费汇总，同时保持 `src/pages/master/index.astro` 只做最小挂载。

**Architecture:** 保持现有 master tab 架构，但把新功能拆到独立组件、独立展示 helper、独立 API 代理与独立轻交互脚本中。服务端通过新的 `/api/master/riders` 薄代理从上游拿聚合数据，SSR 直出骑手状态面板；`index.astro` 只负责引入组件与传递最小 props，不承载新业务细节。

**Tech Stack:** Astro SSR、TypeScript、现有 master tab 架构、Node `node:test`、pnpm。

---

## 文件结构

### 新增文件
- `src/pages/api/master/riders.ts` — master 骑手状态上游薄代理，沿用现有 master auth / proxy 模式。
- `src/lib/master-rider-status-view.ts` — 把上游 payload 归一成适合组件渲染的视图模型与文案映射。
- `src/lib/master-rider-status-view.test.ts` — 视图模型纯函数测试。
- `src/components/master/MasterRiderStatusPanel.astro` — 骑手状态 tab 主面板，负责三栏布局、空状态与总览条。
- `src/components/master/MasterRiderStatusCard.astro` — 单个骑手卡片与展开区。
- `src/scripts/master/rider-status-actions.ts` — 骑手卡展开/折叠等轻交互。
- `src/tests/pages/api/master-riders-route.test.ts` — 新 API 路由的 401 与代理行为测试。
- `src/tests/pages/master/master-riders-ui.test.ts` — 新 tab 的 source/UI 回归测试。

### 修改文件
- `src/lib/master-dashboard-view.ts` — 把 `riders` 纳入 `MasterDashboardTab`，但不承担骑手数据聚合。
- `src/lib/master-active-tab.ts` — 让 `riders` 成为合法 tab。
- `src/pages/master/index.astro` — 只做最小挂载：引入 `MasterRiderStatusPanel`、声明 riders proxy path、在 tab 栏插入入口、在 `tab=riders` 时把 SSR 数据传给组件。

### 参考文件
- `src/pages/api/master/dispatch.ts` — 新 master API 代理的参考。
- `src/components/master/MasterOverview.astro` — 总览卡片样式与组件组织参考。
- `src/tests/pages/master/master-dispatch-ui.test.ts` — master 页面 source 级测试参考。
- `src/tests/pages/api/master-dispatch-route.test.ts` — API 401 测试参考。

---

### Task 1: 扩展 master tab 枚举并锁定 riders 入口

**Files:**
- Modify: `src/lib/master-dashboard-view.ts`
- Modify: `src/lib/master-active-tab.ts`
- Test: `src/lib/master-active-tab.test.ts`

- [ ] **Step 1: 先写 failing test，声明 `riders` 是合法 tab**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMasterTab } from './master-active-tab.ts';

test('normalizeMasterTab keeps riders tab', () => {
  assert.equal(normalizeMasterTab('riders'), 'riders');
});
```

- [ ] **Step 2: 跑测试确认先失败**

Run: `node --test src/lib/master-active-tab.test.ts`
历史红灯预期：，提示 `'riders'` 目前没有被识别，返回了默认 tab。

- [ ] **Step 3: 做最小实现，把 riders 加入 tab 联合类型与 normalize 分支**

```ts
export type MasterDashboardTab = 'overview' | 'shops' | 'settings' | 'backup' | 'dispatch' | 'riders';
```

```ts
export function normalizeMasterTab(value: unknown): MasterActiveTab {
  const raw = String(value || '').trim();
  if (raw === 'management') return 'shops';
  if (raw === 'shops') return 'shops';
  if (raw === 'overview') return 'overview';
  if (raw === 'settings') return 'settings';
  if (raw === 'backup') return 'backup';
  if (raw === 'dispatch') return 'dispatch';
  if (raw === 'riders') return 'riders';
  return 'overview';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/lib/master-active-tab.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/lib/master-dashboard-view.ts src/lib/master-active-tab.ts src/lib/master-active-tab.test.ts && git commit -m "feat: add master riders tab key"
```

---

### Task 2: 先锁 API 路由契约，再加 master riders 代理

**Files:**
- Create: `src/tests/pages/api/master-riders-route.test.ts`
- Create: `src/pages/api/master/riders.ts`

- [ ] **Step 1: 写 failing test，先锁 401 语义**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../../../pages/api/master/riders.ts';

test('master riders proxy requires auth like other master routes', async () => {
  const res = await GET({
    request: new Request('http://local/api/master/riders'),
    cookies: { get: () => undefined },
  } as any);

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'unauthorized');
});
```

- [ ] **Step 2: 跑测试确认先失败**

Run: `node --test src/tests/pages/api/master-riders-route.test.ts`
历史红灯预期：，提示模块或导出不存在。

- [ ] **Step 3: 按 dispatch 代理模式实现最小 API 路由**

```ts
import type { APIRoute } from 'astro';
import { API_BASE_URL, MASTER_TOKEN } from '../../../config.ts';
import { proxyMasterRequest } from '../../../lib/master-api-route.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  return proxyMasterRequest({
    request,
    cookies,
    upstreamUrl: `${API_BASE_URL}/api/master/riders`,
    method: 'GET',
    fallbackToken: MASTER_TOKEN,
    allowFallbackToken: false,
  });
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/tests/pages/api/master-riders-route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/tests/pages/api/master-riders-route.test.ts src/pages/api/master/riders.ts && git commit -m "feat: add master riders proxy route"
```

---

### Task 3: 先写纯函数测试，再补骑手状态视图模型

**Files:**
- Create: `src/lib/master-rider-status-view.ts`
- Create: `src/lib/master-rider-status-view.test.ts`

- [ ] **Step 1: 写 failing test，锁定状态映射、缺省值与三栏分组**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMasterRiderStatusView } from './master-rider-status-view.ts';

test('buildMasterRiderStatusView groups riders and normalizes missing values', () => {
  const view = buildMasterRiderStatusView({
    summary: { total_riders: 2, available_riders: 1, busy_riders: 1, offline_riders: 0, active_order_count: 1, cod_order_count: 1, delivery_fee_total: 150, cod_amount_total: 2300 },
    groups: {
      available: [{ rider_id: 1, name: 'A', phone: '111', status: 'available', active_order_count: 0, cod_order_count: 0, delivery_fee_total: 0, cod_amount_total: 0, orders: [] }],
      busy: [{ rider_id: 2, name: 'B', phone: '222', status: 'busy', active_order_count: 1, cod_order_count: 1, delivery_fee_total: 150, cod_amount_total: 2300, orders: [{ order_id: 9, order_no: 'D9', shop_name: 'Shop', status: 'delivering', is_cash_on_delivery: true, order_amount: 2300, delivery_fee: 150, cash_to_collect: 2300 }] }],
      offline: [],
    },
  });

  assert.equal(view.summary.totalRiders, 2);
  assert.equal(view.groups.available[0].statusLabel, '空闲');
  assert.equal(view.groups.busy[0].orders[0].cashTagLabel, '代收');
  assert.equal(view.groups.offline.length, 0);
});
```

- [ ] **Step 2: 跑测试确认先失败**

Run: `node --test src/lib/master-rider-status-view.test.ts`
历史红灯预期：，提示文件或导出不存在。

- [ ] **Step 3: 用最小纯函数实现视图模型**

```ts
export type MasterRiderStatusOrderView = {
  id: string;
  orderNo: string;
  shopName: string;
  status: string;
  acceptedAt: string;
  completedAt: string;
  orderAmount: number;
  deliveryFee: number;
  cashToCollect: number;
  cashTagLabel: '代收' | '非代收';
};

export type MasterRiderStatusCardView = {
  id: string;
  name: string;
  phone: string;
  status: 'available' | 'busy' | 'offline';
  statusLabel: '空闲' | '送餐中' | '下班';
  activeOrderCount: number;
  codOrderCount: number;
  deliveryFeeTotal: number;
  codAmountTotal: number;
  orders: MasterRiderStatusOrderView[];
};

export function buildMasterRiderStatusView(input: any) {
  const normalizeStatusLabel = (status: string) => status === 'busy' ? '送餐中' : status === 'offline' ? '下班' : '空闲';
  const normalizeOrders = (orders: any[] = []) => orders.map((order) => ({
    id: String(order?.order_id || ''),
    orderNo: String(order?.order_no || '-'),
    shopName: String(order?.shop_name || `店铺 #${Number(order?.shop_id || 0)}`),
    status: String(order?.status || '-'),
    acceptedAt: String(order?.accepted_at || ''),
    completedAt: String(order?.completed_at || ''),
    orderAmount: Number(order?.order_amount || 0),
    deliveryFee: Number(order?.delivery_fee || 0),
    cashToCollect: Number(order?.cash_to_collect || 0),
    cashTagLabel: order?.is_cash_on_delivery ? '代收' : '非代收',
  }));

  const normalizeGroup = (rows: any[] = []) => rows.map((row) => ({
    id: String(row?.rider_id || ''),
    name: String(row?.name || '未命名骑手'),
    phone: String(row?.phone || '-'),
    status: row?.status === 'busy' || row?.status === 'offline' ? row.status : 'available',
    statusLabel: normalizeStatusLabel(String(row?.status || 'available')),
    activeOrderCount: Number(row?.active_order_count || 0),
    codOrderCount: Number(row?.cod_order_count || 0),
    deliveryFeeTotal: Number(row?.delivery_fee_total || 0),
    codAmountTotal: Number(row?.cod_amount_total || 0),
    orders: normalizeOrders(Array.isArray(row?.orders) ? row.orders : []),
  }));

  return {
    summary: {
      totalRiders: Number(input?.summary?.total_riders || 0),
      availableRiders: Number(input?.summary?.available_riders || 0),
      busyRiders: Number(input?.summary?.busy_riders || 0),
      offlineRiders: Number(input?.summary?.offline_riders || 0),
      activeOrderCount: Number(input?.summary?.active_order_count || 0),
      codOrderCount: Number(input?.summary?.cod_order_count || 0),
      deliveryFeeTotal: Number(input?.summary?.delivery_fee_total || 0),
      codAmountTotal: Number(input?.summary?.cod_amount_total || 0),
    },
    groups: {
      available: normalizeGroup(input?.groups?.available),
      busy: normalizeGroup(input?.groups?.busy),
      offline: normalizeGroup(input?.groups?.offline),
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/lib/master-rider-status-view.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/lib/master-rider-status-view.ts src/lib/master-rider-status-view.test.ts && git commit -m "feat: add master rider status view model"
```

---

### Task 4: 先写 source 测试，再加独立骑手状态组件

**Files:**
- Create: `src/tests/pages/master/master-riders-ui.test.ts`
- Create: `src/components/master/MasterRiderStatusCard.astro`
- Create: `src/components/master/MasterRiderStatusPanel.astro`

- [ ] **Step 1: 写 failing source test，锁页面必须通过独立组件接线**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const panelPath = resolve(process.cwd(), 'src/components/master/MasterRiderStatusPanel.astro');
const cardPath = resolve(process.cwd(), 'src/components/master/MasterRiderStatusCard.astro');

test('master rider status panel renders summary and three groups', async () => {
  const panel = await readFile(panelPath, 'utf8');
  const card = await readFile(cardPath, 'utf8');

  assert.match(panel, /空闲/);
  assert.match(panel, /送餐中/);
  assert.match(panel, /下班/);
  assert.match(panel, /代收订单/);
  assert.match(panel, /代收总额/);
  assert.match(panel, /配送费总额/);
  assert.match(card, /data-master-rider-card/);
  assert.match(card, /data-master-rider-toggle/);
  assert.match(card, /代收/);
  assert.match(card, /非代收/);
});
```

- [ ] **Step 2: 跑测试确认先失败**

Run: `node --test src/tests/pages/master/master-riders-ui.test.ts`
历史红灯预期：，提示组件文件不存在。

- [ ] **Step 3: 实现最小组件结构，先把布局和文案立住**

`src/components/master/MasterRiderStatusCard.astro`

```astro
---
import type { MasterRiderStatusCardView } from '../../lib/master-rider-status-view.ts';

const { rider } = Astro.props as { rider: MasterRiderStatusCardView };
---

<article class="rider-card" data-master-rider-card>
  <button class="rider-card-head" type="button" data-master-rider-toggle aria-expanded="false">
    <div>
      <div class="rider-name">{rider.name}</div>
      <div class="rider-phone">{rider.phone}</div>
    </div>
    <div class="rider-badges">
      <span>{rider.statusLabel}</span>
      <span>进行中 {rider.activeOrderCount}</span>
      <span>代收订单 {rider.codOrderCount}</span>
      <span>代收总额 {rider.codAmountTotal}</span>
      <span>配送费总额 {rider.deliveryFeeTotal}</span>
    </div>
  </button>

  <div class="rider-orders" hidden>
    {rider.orders.length > 0 ? rider.orders.map((order) => (
      <div class="rider-order-row">
        <strong>订单 #{order.orderNo}</strong>
        <div>{order.shopName}</div>
        <div>{order.status}</div>
        <div>{order.cashTagLabel}</div>
        <div>{order.orderAmount}</div>
        <div>{order.deliveryFee}</div>
        <div>{order.cashToCollect}</div>
      </div>
    )) : <div class="rider-empty">当前无进行中订单</div>}
  </div>
</article>
```

`src/components/master/MasterRiderStatusPanel.astro`

```astro
---
import MasterRiderStatusCard from './MasterRiderStatusCard.astro';
import type { ReturnTypeForPlanOnly } from '../../lib/master-rider-status-view.ts';

const { view } = Astro.props as { view: any };
const groups = [
  { key: 'available', label: '空闲', rows: view.groups.available },
  { key: 'busy', label: '送餐中', rows: view.groups.busy },
  { key: 'offline', label: '下班', rows: view.groups.offline },
];
---

<section class="master-rider-status-panel">
  <div class="master-overview">
    <div>平台骑手总人数 {view.summary.totalRiders}</div>
    <div>空闲人数 {view.summary.availableRiders}</div>
    <div>送餐中人数 {view.summary.busyRiders}</div>
    <div>下班人数 {view.summary.offlineRiders}</div>
    <div>进行中订单 {view.summary.activeOrderCount}</div>
    <div>代收订单 {view.summary.codOrderCount}</div>
    <div>配送费总额 {view.summary.deliveryFeeTotal}</div>
    <div>代收总额 {view.summary.codAmountTotal}</div>
  </div>

  <div class="rider-group-grid">
    {groups.map((group) => (
      <section class="rider-group-card">
        <h3>{group.label}</h3>
        {group.rows.length > 0 ? group.rows.map((rider) => <MasterRiderStatusCard rider={rider} />) : <div class="notice">当前无{group.label}骑手</div>}
      </section>
    ))}
  </div>
</section>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/tests/pages/master/master-riders-ui.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/tests/pages/master/master-riders-ui.test.ts src/components/master/MasterRiderStatusCard.astro src/components/master/MasterRiderStatusPanel.astro && git commit -m "feat: add master rider status components"
```

---

### Task 5: 先写脚本测试思路，再补轻交互脚本

**Files:**
- Create: `src/scripts/master/rider-status-actions.ts`
- Modify: `src/components/master/MasterRiderStatusCard.astro`

- [ ] **Step 1: 在计划中先锁交互约束：只做展开/折叠，不把复杂逻辑塞到页面入口**

```ts
export function initMasterRiderStatusActions(root: ParentNode = document) {
  root.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-master-rider-toggle]') : null;
    if (!(trigger instanceof HTMLButtonElement)) return;

    const card = trigger.closest('[data-master-rider-card]');
    const body = card?.querySelector('[data-master-rider-orders]');
    if (!(body instanceof HTMLElement)) return;

    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    body.hidden = expanded;
  });
}
```

- [ ] **Step 2: 先接线到组件 DOM，故意让 source 还不满足，确认需要真实落地**

在卡片组件里把订单区和切换按钮补上 data 标记：

```astro
<button class="rider-card-head" type="button" data-master-rider-toggle aria-expanded="false">
```

```astro
<div class="rider-orders" data-master-rider-orders hidden>
```

- [ ] **Step 3: 实现脚本文件**

```ts
export function initMasterRiderStatusActions(root: ParentNode = document) {
  root.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-master-rider-toggle]') : null;
    if (!(trigger instanceof HTMLButtonElement)) return;

    const card = trigger.closest('[data-master-rider-card]');
    const body = card?.querySelector('[data-master-rider-orders]');
    if (!(body instanceof HTMLElement)) return;

    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    body.hidden = expanded;
  });
}
```

- [ ] **Step 4: 跑已有 source test，确认没有破坏组件结构**

Run: `node --test src/tests/pages/master/master-riders-ui.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/scripts/master/rider-status-actions.ts src/components/master/MasterRiderStatusCard.astro && git commit -m "feat: add master rider status expand actions"
```

---

### Task 6: 先写页面 source 回归，再做最小挂载到 master 入口

**Files:**
- Modify: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Modify: `src/pages/master/index.astro`
- Modify: `src/components/master/MasterRiderStatusPanel.astro`

- [ ] **Step 1: 扩展 master 页面 source 测试，锁 riders tab 接线存在**

在现有 `src/tests/pages/master/master-dispatch-ui.test.ts` 后追加一个新用例：

```ts
test('master page source wires riders tab into dashboard layout', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /href="\/master\?tab=riders"/);
  assert.match(page, /data-master-panel="riders"/);
  assert.match(page, /MasterRiderStatusPanel/);
  assert.match(page, /const MASTER_RIDERS_PROXY_PATH = '\/api\/master\/riders';/);
  assert.doesNotMatch(page, /代收订单[\s\S]{0,400}代收总额[\s\S]{0,400}配送费总额/);
});
```

说明：最后一个断言用来防止把整个 riders 大块展示直接堆回 `index.astro`；这些文案应主要在独立组件里，而不是在页面入口里大段出现。

- [ ] **Step 2: 跑测试确认先失败**

Run: `node --test src/tests/pages/master/master-dispatch-ui.test.ts`
历史红灯预期：，提示 riders tab / proxy path / 组件引用不存在。

- [ ] **Step 3: 以最小改动挂载 riders tab，避免把业务细节塞回入口**

在 `src/pages/master/index.astro` 中只做这些事情：

```astro
import MasterRiderStatusPanel from '../../components/master/MasterRiderStatusPanel.astro';
import { buildMasterRiderStatusView } from '../../lib/master-rider-status-view.ts';
```

```ts
let masterRiders = buildMasterRiderStatusView({ summary: {}, groups: { available: [], busy: [], offline: [] } });
const MASTER_RIDERS_PROXY_PATH = '/api/master/riders';
```

```ts
if (!isUnauthorized && activeTab === 'riders') {
  const auth = resolveMasterAuth(Astro.request, Astro.cookies, MASTER_TOKEN, { allowFallbackToken: false });
  const cookie = Astro.request.headers.get(MASTER_INIT_COOKIE_HEADER) || '';
  const ridersUrl = new URL(MASTER_RIDERS_PROXY_PATH, Astro.url);
  const res = await fetch(ridersUrl, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
  if (res.ok) {
    masterRiders = buildMasterRiderStatusView(await res.json().catch(() => ({})));
  }
}
```

```astro
<a class:list={["tab-btn", activeTab === 'riders' && 'active']} href="/master?tab=riders">骑手状态</a>
```

```astro
<div class="master-stack" data-master-panel="riders" hidden={activeTab !== 'riders' || !shouldShowMasterContent}>
  <MasterRiderStatusPanel view={masterRiders} />
</div>
```

不要把 riders 的大量样式、循环渲染、交互脚本直接写在 `index.astro` 里。

- [ ] **Step 4: 跑页面 source 测试确认通过**

Run: `node --test src/tests/pages/master/master-dispatch-ui.test.ts src/tests/pages/master/master-riders-ui.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/tests/pages/master/master-dispatch-ui.test.ts src/pages/master/index.astro src/components/master/MasterRiderStatusPanel.astro && git commit -m "feat: mount master rider status tab"
```

---

### Task 7: 接上轻交互脚本并完成构建验证

**Files:**
- Modify: `src/pages/master/index.astro`
- Modify: `src/scripts/master/rider-status-actions.ts`
- Test: `src/tests/pages/master/master-dispatch-ui.test.ts`
- Test: `src/tests/pages/master/master-riders-ui.test.ts`
- Test: `src/tests/pages/api/master-riders-route.test.ts`
- Test: `src/lib/master-rider-status-view.test.ts`

- [ ] **Step 1: 先写最小接线，保证 index.astro 只是 import + init，不承载细节**

在页面现有 module script 区只新增一条引用和一条初始化：

```ts
import { initMasterRiderStatusActions } from '../../scripts/master/rider-status-actions';
```

```ts
document.addEventListener('DOMContentLoaded', () => {
  shopTableBindings.handleDomContentLoaded();
  backupActionBindings.handleDomContentLoaded();
  initMasterRiderStatusActions(document);
});
```

- [ ] **Step 2: 跑相关测试**

Run: `node --test src/lib/master-active-tab.test.ts src/lib/master-rider-status-view.test.ts src/tests/pages/api/master-riders-route.test.ts src/tests/pages/master/master-dispatch-ui.test.ts src/tests/pages/master/master-riders-ui.test.ts`
Expected: 全部 PASS。

- [ ] **Step 3: 跑完整构建验证**

Run: `pnpm build`
Expected: BUILD SUCCESS。

- [ ] **Step 4: 做一次自查，确认没有把 riders 大块逻辑堆进 index.astro**

检查点：

```txt
- index.astro 仅有 tab 挂载、SSR 取数、组件引用、脚本初始化
- riders 的卡片循环在 MasterRiderStatusPanel.astro / MasterRiderStatusCard.astro
- riders 的交互在 src/scripts/master/rider-status-actions.ts
- riders 的数据归一在 src/lib/master-rider-status-view.ts
```

- [ ] **Step 5: 提交最终实现**

```bash
git add src/pages/master/index.astro src/scripts/master/rider-status-actions.ts src/lib/master-rider-status-view.ts src/lib/master-rider-status-view.test.ts src/pages/api/master/riders.ts src/tests/pages/api/master-riders-route.test.ts src/components/master/MasterRiderStatusPanel.astro src/components/master/MasterRiderStatusCard.astro src/tests/pages/master/master-riders-ui.test.ts src/tests/pages/master/master-dispatch-ui.test.ts src/lib/master-dashboard-view.ts src/lib/master-active-tab.ts src/lib/master-active-tab.test.ts && git commit -m "feat: add master rider status dashboard"
```

---

## 自检结果

### Spec coverage
- 独立 `riders` tab：Task 1、Task 6
- master 只统计平台骑手：通过接口契约与视图模型约束，落在 Task 2、Task 3、Task 6
- 顶部总览条：Task 4
- 三栏状态看板：Task 3、Task 4
- 进行中订单展开：Task 4、Task 5
- `/api/master/riders` 薄代理：Task 2
- 避免把代码继续堆进 `index.astro`：Task 4、Task 6、Task 7 的约束与检查点

### Placeholder scan
- 已避免 `TODO`、`TBD`、`similar to`。
- 每个代码步骤都给了明确文件与代码片段。
- 每个测试步骤都给了明确命令与预期。

### Type consistency
- 新 tab key 统一使用 `riders`
- 视图模型统一使用 `summary` / `groups` / `orders`
- 组件 props 统一使用 `view` 与 `rider`
- API 路由统一代理到 `/api/master/riders`
