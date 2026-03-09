# CartModal Second Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在第一刀拆分稳定运行的基础上，继续把 `CartModal` 中最重的堂食备注区和外卖表单区抽离出来，进一步降低主文件复杂度。

**Architecture:** 第二刀继续坚持低风险拆分，不改核心提交流程，不动 table modal 主流程。通过提取 `CartDineInRemarksPanel` 和 `CartDeliveryForm`，让 `CartModal.tsx` 更聚焦于状态调度和组合，而不是承载大段 UI 实现。

**Tech Stack:** Preact, TypeScript, nanostores

---

### Task 1: 拆出 CartDineInRemarksPanel

**Files:**
- Create: `meituanAstro/src/components/cart-modal/CartDineInRemarksPanel.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取堂食备注区**

包含：
- 展开/收起
- 已选备注预览
- 分类选项列表
- 自定义备注输入

**Step 2: 保持现有行为**

保留：
- `toggleRemark`
- `remarkDispatch`
- `dineInRemarks`
- `dineInCustomRemark`
- `showRemarksPanel`

---

### Task 2: 拆出 CartDeliveryForm

**Files:**
- Create: `meituanAstro/src/components/cart-modal/CartDeliveryForm.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取 step 2 外卖表单主体**

包含：
- 姓名/电话
- 历史地址
- 区域选择
- 地址输入
- 配送时间
- 外卖备注区
- 支付按钮
- 返回购物车按钮

**Step 2: 保持现有行为**

保留：
- `setForm`
- `setDeliveryTimeMode`
- `setReservationTime`
- `submitOrder`
- `remarkDispatch`
- `deliveryRemarks`
- `customRemark`

---

### Task 3: 视情况补充备注渲染辅助

**Files:**
- Optional Create: `meituanAstro/src/components/cart-modal/remark-ui.ts`

**Step 1: 仅在出现明显重复时提取**

如果堂食备注区和外卖备注区存在完全重复的分类按钮渲染模式，再补这个文件。

**Step 2: 否则不做**

YAGNI，避免过度抽象。

---

### Task 4: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-cartmodal-second-cut.md`

**Step 1: 记录完成范围**

记录已拆出的：
- `CartDineInRemarksPanel`
- `CartDeliveryForm`

**Step 2: 记录后续范围**

后续再考虑：
- table modal 区域
- step 1 / step 2 视图壳层
