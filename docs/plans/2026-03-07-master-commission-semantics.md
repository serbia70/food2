# Master Commission Semantics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正 `/master` 中“提成规则”和“提成累计”混淆的问题，让表格、详情、编辑面板分别表达清楚“计算方式”和“历史累计结果”。

**Architecture:** 不在这一轮引入“平台默认规则 / 店铺覆盖”的完整机制，只先把现有信息表达清楚。表格中的“提成”列改名为“提成累计”，继续展示月累计 / 总累计；编辑面板中的字段明确改成“提成计算方式 / 提成计算数值”；同时在详情或轻量位置显示当前规则，避免用户修改规则后误以为累计金额也应立即变化。

**Tech Stack:** Astro, TypeScript, existing master detail/edit flow

---

### Task 1: 为提成规则展示 helper 写最小测试

**Files:**
- Create: `meituanAstro/src/lib/master-commission-view.ts`
- Create: `meituanAstro/src/lib/master-commission-view.test.ts`

**Step 1: Write the failing test**

增加测试覆盖：
- `percentage + 3` -> `百分比 3%`
- `per_order + 35` -> `每单 35 RSD`
- 缺失值时返回合理兜底文案

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-commission-view.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-commission-view.ts`，实现：
- `formatCommissionRule(type, value)`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-commission-view.test.ts`
Expected: PASS

---

### Task 2: 表格列改名为“提成累计”

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Rename column**

把表头：
- `提成`

改成：
- `提成累计`

**Step 2: Clarify sublabel**

保留金额展示，但小字明确为：
- `月累计 / 总累计`

不要再让这列看起来像“当前提成配置”。

---

### Task 3: 编辑面板文案改为“提成计算方式”

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopEditPanel.astro`

**Step 1: Rename labels**

将：
- `提成类型`
- `提成数值`

改成：
- `提成计算方式`
- `提成计算数值`

**Step 2: Add helper copy**

在面板中增加一行说明：
- `这里只修改未来订单的提成计算规则，不会改历史累计金额。`

---

### Task 4: 在详情中显示当前提成规则

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/lib/master-shop-view.ts`

**Step 1: Ensure rule fields are available**

确认详情面板打开时能拿到：
- `commission_type`
- `commission_value`

**Step 2: Render current rule**

在详情里增加一块轻量信息：
- `当前提成规则：百分比 3%`

**Step 3: Keep detail concise**

只加一小段说明，不把详情重新做成大表单。

---

### Task 5: 编辑成功后提示语对齐“规则”语义

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Keep refresh-based success flow**

保留当前：
- 关闭抽屉
- alert
- 刷新页面

**Step 2: Improve success copy**

提示文案要强调：
- 店铺设置已保存
- 包括提成计算规则

而不是暗示累计金额会即时变化。

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-commission-semantics.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-commission-view.test.ts src/lib/master-edit-feedback.test.ts src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 表格列名已变成 `提成累计`
- 编辑面板文案明确是“提成计算方式”
- 详情中能看到当前规则
- 修改规则后不会再误解为累计金额应该立刻改变
