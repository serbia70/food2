# CartModal Third Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在前两刀拆分稳定后，继续把 `CartModal` 中剩余最大的桌号弹窗区域和堂食桌号流程抽离出来，让主文件进一步收口为组合层。

**Architecture:** 第三刀只拆 `showTableModal` 对应的整块 UI 和与之绑定的流程性动作，不动核心 submit hook，不改变桌号规则。通过提取 `CartTableModal.tsx` 和 `useDineInTableFlow.ts`，让 `CartModal.tsx` 摆脱最后一大段弹窗实现代码。

**Tech Stack:** Preact, TypeScript

---

### Task 1: 拆出 CartTableModal

**Files:**
- Create: `meituanAstro/src/components/cart-modal/CartTableModal.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取桌号弹窗整块 UI**

包含：
- 关闭按钮
- 桌号选择区
- 手输桌号输入框
- 堂食备注大面板
- 确认按钮

**Step 2: 保持现有行为**

保留：
- `tableConfig`
- `tableNumber`
- `setTableNumber`
- `simpleHallMode`
- `remarkCategories`
- `dineInRemarks`
- `dineInCustomRemark`
- `showRemarksPanel`

---

### Task 2: 拆出 useDineInTableFlow

**Files:**
- Create: `meituanAstro/src/components/cart-modal/useDineInTableFlow.ts`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取堂食桌号流程动作**

提取：
- `handleConfirmDineIn`
- `handleSwitchTable`
- 打开 table modal 的辅助动作
- 关闭 table modal 的辅助动作

**Step 2: 保持现有行为**

不要改变：
- 已有桌号时的堂食下单逻辑
- 切换桌号流程
- table modal 打开/关闭节奏

---

### Task 3: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-cartmodal-third-cut.md`

**Step 1: 记录完成范围**

记录已拆出的：
- `CartTableModal.tsx`
- `useDineInTableFlow.ts`

**Step 2: 记录后续范围**

后续再考虑：
- step 1 / step 2 视图壳层
- 剩余内联 style 收口
