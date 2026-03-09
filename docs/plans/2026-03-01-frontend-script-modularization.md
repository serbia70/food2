# Frontend Script Modularization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将桌号页面脚本从 `index.astro` 内联拆分到 `src/scripts`，保留现有行为与 API 协议。

**Architecture:** 使用 `table-page.ts` 作为入口模块，按 `utils / details / actions` 分层；`index.astro` 保留轻量 bootstrap 仅注入 `slug` 与配置。

**Tech Stack:** Astro + TypeScript (module scripts)

---

### Task 1: 抽取工具函数模块

**Files:**
- Create: `meituanAstro/src/scripts/shop/table-utils.ts`
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 写一个最小化失败验证（手工）**

```text
在浏览器控制台执行:
window.openTableDetails('2号桌', '2')
预期: 弹窗出现，无控制台报错
```

**Step 2: 创建 utils 模块**

实现并导出：
```ts
export function buildTableLookupKeys(tableValue: unknown): string[] {
  const base = String(tableValue || '').trim();
  if (!base) return [];
  const keys = [base];
  const m = base.match(/^(.*?)\s*(\d+)(?:号桌)?$/u);
  const area = m ? String(m[1] || '').replace(/\s+/g, '').trim().toLowerCase() : '';
  const numericPart = m ? String(m[2] || '').trim() : '';
  if (m && area && numericPart) {
    const noDesk = `${String(m[1] || '').trim()}${numericPart}`;
    if (!keys.includes(noDesk)) keys.push(noDesk);
  }
  if (numericPart && !area && !keys.includes(numericPart)) {
    keys.push(numericPart);
  }
  if (!numericPart) {
    const legacy1 = `${base}1`;
    const legacy1Desk = `${base}1号桌`;
    if (!keys.includes(legacy1)) keys.push(legacy1);
    if (!keys.includes(legacy1Desk)) keys.push(legacy1Desk);
  }
  return keys;
}

export function escapeHtml(v: unknown): string {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createBelgradeFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('sr-RS', options);
}
```

**Step 3: 从 `index.astro` 移除 inline utils 定义**

删除内联 `buildTableLookupKeys` 与 `escape` 等逻辑，改由模块提供。

**Step 4: 手工验证**

```text
window.openTableDetails('2号桌', '2')
预期: 弹窗可打开且无控制台错误
```

**Step 5: Commit**

```bash
git commit -m "refactor: extract table utils module"
```

---

### Task 2: 抽取订单详情逻辑模块

**Files:**
- Create: `meituanAstro/src/scripts/shop/table-details.ts`
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 写一个最小化失败验证（手工）**

```text
断网后点击“订单详情”
预期: 弹窗显示“加载失败，请稍后重试”，无报错
```

**Step 2: 创建 table-details 模块**

```ts
import { buildTableLookupKeys, escapeHtml } from './table-utils';

type DetailsDeps = {
  slug: string;
  ended: Set<string>;
  fmt: Intl.DateTimeFormat;
};

export function createTableDetails(deps: DetailsDeps) {
  const { slug, ended, fmt } = deps;

  function closeTableDetailsModal() { ... }

  function showTableDetailsModal(title: string, rows: string[], total: number) { ... }

  async function safeFetchOrders(key: string) {
    try {
      const res = await fetch(`/api/order/by_table?slug=${encodeURIComponent(slug)}&table=${encodeURIComponent(key)}`);
      if (!res.ok) return [] as any[];
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data && data.orders) ? data.orders : [];
    } catch {
      return [] as any[];
    }
  }

  async function openTableDetails(tableValue: unknown, displayNum: unknown) {
    try {
      const keys = buildTableLookupKeys(tableValue);
      const merged = new Map<number, any>();
      for (const key of keys) {
        const orders = await safeFetchOrders(key);
        for (const o of orders) {
          const id = Number((o && o.id) || 0);
          if (id > 0) merged.set(id, o);
        }
      }
      const all = Array.from(merged.values());
      const active = all.filter((o) => !ended.has(String((o && o.status) || '').toLowerCase()));
      if (active.length === 0) {
        showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, [], 0);
        return;
      }
      const lines = active
        .sort((a, b) => Number((b && b.id) || 0) - Number((a && a.id) || 0))
        .map((o, idx) => {
          const raw = String((o && o.created_at) || '').replace(' ', 'T');
          const d = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
          const t = Number.isNaN(d.getTime()) ? String((o && o.created_at) || '--') : fmt.format(d);
          let itemText = '';
          try {
            const parsed = JSON.parse(String((o && o.items_json) || '[]'));
            const arr = Array.isArray(parsed)
              ? parsed
              : parsed && typeof parsed === 'object'
                ? Object.values(parsed)
                : [];
            itemText = arr
              .map((it: any) => {
                const n = String((it && (it.name || it.product_name)) || '').trim();
                const sub = String((it && (it.sub_name || it.subName)) || '').trim();
                const q = Number((it && (it.quantity || it.qty)) || 1);
                if (!n) return '';
                return `${n}${sub ? `(${sub})` : ''}x${q}`;
              })
              .filter(Boolean)
              .join('、');
          } catch {}
          const base = `${idx + 1}. #${(o && (o.order_no || o.id)) || ''} | ${(o && o.total_amount) || 0} RSD | ${t}`;
          return itemText ? `${base}\n   菜品: ${itemText}` : base;
        });
      const total = active.reduce((sum, o) => sum + Number((o && o.total_amount) || 0), 0);
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, lines, total);
    } catch {
      showTableDetailsModal(`桌号 ${displayNum} 订单详情 / Sto ${displayNum}`, ['加载失败，请稍后重试'], 0);
    }
  }

  return { openTableDetails, closeTableDetailsModal };
}
```

**Step 3: 从 `index.astro` 移除内联详情逻辑**

删除 `openTableDetails/showTableDetailsModal/closeTableDetailsModal` 的内联实现。

**Step 4: 手工验证**

```text
window.openTableDetails('2号桌', '2')
预期: 弹窗内容与原先一致
```

**Step 5: Commit**

```bash
git commit -m "refactor: extract table details module"
```

---

### Task 3: 抽取导航/操作模块

**Files:**
- Create: `meituanAstro/src/scripts/shop/table-actions.ts`
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 创建 actions 模块**

```ts
type ActionsDeps = { slug: string };

export function createTableActions(deps: ActionsDeps) {
  const { slug } = deps;
  const goToDeliveryMode = () => {
    window.location.href = `/${slug}`;
  };
  const openReservationModal = () => {
    window.dispatchEvent(new Event('open-reservation'));
  };
  const openTableOrder = (tableValue: unknown) => {
    window.location.href = `/${slug}?table=${encodeURIComponent(String(tableValue))}&op=new&_t=${Date.now()}`;
  };
  const openTableAdd = (tableValue: unknown) => {
    window.location.href = `/${slug}?table=${encodeURIComponent(String(tableValue))}&op=add&_t=${Date.now()}`;
  };
  return { goToDeliveryMode, openReservationModal, openTableOrder, openTableAdd };
}
```

**Step 2: 从 `index.astro` 移除内联导航逻辑**

删除 `openTableOrder/openTableAdd/goToDeliveryMode/openReservationModal` 的内联实现。

**Step 3: 手工验证**

```text
点击“点餐/加餐/外卖/预订”
预期: 跳转或弹窗行为与之前一致
```

**Step 4: Commit**

```bash
git commit -m "refactor: extract table actions module"
```

---

### Task 4: 建立入口模块与 bootstrap

**Files:**
- Create: `meituanAstro/src/scripts/shop/table-page.ts`
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 创建入口模块**

```ts
import { createBelgradeFormatter } from './table-utils';
import { createTableDetails } from './table-details';
import { createTableActions } from './table-actions';

type InitConfig = {
  slug: string;
  endedStatusList: string[];
  belgradeTimeOptions: Intl.DateTimeFormatOptions;
};

export function initTablePage(config: InitConfig) {
  const slug = String(config.slug || '');
  const ended = new Set((config.endedStatusList || []).map((s) => String(s).toLowerCase()));
  const fmt = createBelgradeFormatter(config.belgradeTimeOptions || {});

  const details = createTableDetails({ slug, ended, fmt });
  const actions = createTableActions({ slug });

  window.closeTableDetailsModal = details.closeTableDetailsModal;
  window.openTableDetails = details.openTableDetails;
  window.goToDeliveryMode = actions.goToDeliveryMode;
  window.openReservationModal = actions.openReservationModal;
  window.openTableOrder = actions.openTableOrder;
  window.openTableAdd = actions.openTableAdd;
}
```

**Step 2: 修改 `index.astro` 引入入口模块**

```astro
<script type="module">
  import { initTablePage } from '/src/scripts/shop/table-page';
  initTablePage({ slug, endedStatusList, belgradeTimeOptions });
</script>
```

并移除原内联脚本逻辑主体。

**Step 3: 手工验证**

```text
1) 进入 /<slug>/tables 页面
2) 点击任意桌号“订单详情”
3) 确认弹窗内容、合计与关闭按钮正常
```

**Step 4: Commit**

```bash
git commit -m "refactor: move table page script to modules"
```
