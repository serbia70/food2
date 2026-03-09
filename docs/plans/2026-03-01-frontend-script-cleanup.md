# Frontend Script Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 整理 `meituanAstro/src/pages/[slug]/index.astro` 内联脚本结构，减少全局污染，保持现有行为不变。

**Architecture:** 保留内联脚本并拆分职责块（utils / tableDetails / navActions）。仅暴露必要的 `window.*` 入口，其余封装在闭包内。请求与渲染逻辑保持一致，统一错误处理。

**Tech Stack:** Astro (server + inline script), TypeScript/JavaScript

---

### Task 1: 识别并整理内联脚本职责块

**Files:**
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 写一个最小化的失败验证（手工）**

验证入口函数是否可用（当前为基线，记录现状）：
```text
在浏览器控制台执行:
window.openTableDetails('2号桌', '2')
预期: 弹窗出现，无控制台报错
```

**Step 2: 拆分函数结构**

在内联脚本中按照以下结构重排（不改变逻辑）：
```ts
// utils
function __esc(v) { ... }
function buildTableLookupKeys(tableValue) { ... }

// tableDetails
function showTableDetailsModal(title, rows, total) { ... }
function closeTableDetailsModal() { ... }
async function openTableDetails(tableValue, displayNum) { ... }

// navActions
function goToDeliveryMode() { ... }
function openReservationModal() { ... }
function openTableOrder(tableValue) { ... }
function openTableAdd(tableValue) { ... }
```

**Step 3: 保留最小 `window.*` 暴露**

仅保留以下入口绑定：
```ts
window.closeTableDetailsModal = closeTableDetailsModal;
window.openTableDetails = openTableDetails;
window.goToDeliveryMode = goToDeliveryMode;
window.openReservationModal = openReservationModal;
window.openTableOrder = openTableOrder;
window.openTableAdd = openTableAdd;
```

**Step 4: 统一错误处理**

在 `openTableDetails` 入口捕获异常，内部 `fetch` 失败时返回空数组而不是抛错。
```ts
const data = await res.json().catch(() => ({}));
const orders = Array.isArray(data && data.orders) ? data.orders : [];
```

**Step 5: 手工验证**

```text
window.openTableDetails('2号桌', '2')
预期: 弹窗展示，若无订单显示“当前无进行中订单”，不出现“加载失败”。
```

**Step 6: Commit**

```bash
git commit -m "refactor: organize table details inline script"
```

---

### Task 2: 保持行为不变的微调与清理

**Files:**
- Modify: `meituanAstro/src/pages/[slug]/index.astro`

**Step 1: 检查是否有重复的常量或集合**

将 `__ended`、时间格式化等保持为单一来源，避免重复定义。

**Step 2: 手工验证**

```text
1) 进入 /02/tables 页面
2) 点击任意桌号的“订单详情 / Detalji”
3) 确认弹窗内容与关闭按钮正常
```

**Step 3: Commit**

```bash
git commit -m "refactor: simplify table details helpers"
```
