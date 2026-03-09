# Master Topup Focus Highlight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让主控台充值成功后刷新页面时自动滚动到刚操作的店铺并高亮该行，避免成功提示和余额变化跑到页面顶部看不见。

**Architecture:** 延续当前“充值成功后关闭抽屉并刷新页面”的稳定方案，但补上上下文恢复。通过 `sessionStorage` 记录 `shop_id`，刷新后在 `DOMContentLoaded` 阶段定位目标行，执行 `scrollIntoView` 并添加短暂高亮 class，让用户立刻看到自己刚充值的那一行及更新后的余额。

**Tech Stack:** Astro, TypeScript, existing table row dataset markers, sessionStorage

---

### Task 1: 为目标店铺定位 helper 写测试

**Files:**
- Create: `meituanAstro/src/lib/master-focus-shop.ts`
- Create: `meituanAstro/src/lib/master-focus-shop.test.ts`

**Step 1: Write the failing test**

写测试覆盖：
- 规范化 shop id 字符串
- 非法值回退为空
- 可用于 sessionStorage 恢复

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-focus-shop.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-focus-shop.ts`，实现：
- `normalizeMasterFocusShopId(value)`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-focus-shop.test.ts`
Expected: PASS

---

### Task 2: 充值成功后记录目标店铺

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Store focused shop id**

在充值成功分支中，除已有 `master_flash_message` 外，再保存：
- `master_focus_shop_id`

值为当前充值成功返回的 `billing.shop_id`。

**Step 2: Keep existing reload flow**

仍然保持：
- 关闭抽屉
- `window.location.reload()`

---

### Task 3: 刷新后滚动到目标行

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Reuse existing row marker**

继续使用现有：
- `data-shop-id`

**Step 2: Add focus restore logic**

在 `DOMContentLoaded` 中：
- 读取 `master_focus_shop_id`
- 找到对应行
- 执行 `scrollIntoView({ block: 'center', behavior: 'smooth' })`

**Step 3: Clear storage after use**

定位完成后清除：
- `master_focus_shop_id`

---

### Task 4: 为目标行增加短暂高亮

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add highlight class**

定义类似：
- `.row-focused`

要求：
- 颜色明显但不过于刺眼
- 与当前控制台表格风格一致

**Step 2: Apply and remove highlight**

定位到目标行后：
- 添加 `row-focused`
- 数秒后移除

---

### Task 5: 保持成功提示可见但不过度打扰

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Keep flash message**

仍然保留：
- `充值成功，余额已更新`

**Step 2: Coordinate with focus behavior**

要求：
- 提示存在，但用户视线主要落在目标行高亮区域
- 不需要做复杂动画

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-topup-focus-highlight.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-active-tab.test.ts src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-billing-state.test.ts src/lib/master-focus-shop.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 在表格较下方店铺执行充值
- 刷新后自动滚到该行
- 该行短暂高亮
- 余额已更新
- 页面仍显示成功提示
