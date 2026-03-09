# Master Balance Only Column Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 进一步精简 `/master` 店铺管理表格：账单 / 余额列只显示余额，所有异常说明统一收敛到门店状态列，避免重复文案和语义冲突。

**Architecture:** 继续沿用后端统一生成的 `display_shop_state` 与 `display_shop_state_reason`。前端表格移除账单列中的状态标签和锁定说明，只保留余额数值；异常信息全部由门店状态列承载。提成列维持累计金额展示，不再暗示是配置值。

**Tech Stack:** Astro, TypeScript, existing `/api/master/init` display fields

---

### Task 1: 为前端表格职责调整写最小测试

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加测试，确认：
- 门店状态列优先展示 `display_shop_state`
- 异常原因展示在 `shopStateReason`
- 余额列只保留数值展示需要的数据，不再依赖 `billingLabel` 作为主可见内容

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果当前还以账单标签作为主展示内容。

**Step 3: Write minimal implementation**

根据需要在 `master-shop-view.ts` 中补齐或调整 view model 字段，保证前端表格无需再从账单列推导异常信息。

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 2: 将“账单 / 余额”列改为仅显示余额

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Rename column if needed**

把当前：
- `账单 / 余额`

改成更直接的：
- `余额`

**Step 2: Remove billing label and duplicate warning text**

移除：
- `正常`
- `预警`
- 账单列里的锁定提示

只保留：
- 余额数值，如 `9,800 RSD`

---

### Task 3: 让异常只留在门店状态列

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Keep primary state + reason only**

门店状态列继续显示：
- 主状态：`正常运营 / 外卖已锁定 / 堂食点餐停止 / 外卖堂食均停止 / 已停用`
- 异常时才显示原因小字

**Step 2: Avoid duplicated meaning**

如果主状态已经表达异常，余额列和其他列不再重复这层意思。

---

### Task 4: 明确提成列语义

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Make cumulative nature explicit**

继续显示当前累计结果，但文案更明确，例如：
- `提成累计`

或保留现有金额但把小字说明改清楚，避免误解成“配置值”。

---

### Task 5: 验证删除店铺和其他动作不受影响

**Files:**
- Modify: `docs/plans/2026-03-07-master-balance-only-column.md`

**Step 1: Manual verification target**

确认以下动作在表格精简后仍可用：
- 详情
- 编辑
- 充值
- 后台
- 打开前台
- 删除

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-balance-only-column.md`

**Step 1: Run frontend tests**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 门店状态列承担全部异常说明
- 余额列只显示余额数字
- 表格整体更简洁
