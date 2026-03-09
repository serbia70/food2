# CartModal First Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变 `CartModal` 业务行为的前提下，完成第一刀低风险拆分，先把用户资料同步、订单提交、认证卡片、模式按钮区从主文件中抽离出来。

**Architecture:** 第一轮只拆稳定逻辑层和局部 UI 块，不重写 step 结构，不动 remark 与 table modal 主流程。通过 `hook + 小组件` 的方式减少 `CartModal.tsx` 体积，同时保证现有交互保持不变。

**Tech Stack:** Preact, TypeScript, nanostores

---

### Task 1: 拆出 useCartProfileSync

**Files:**
- Create: `meituanAstro/src/components/cart-modal/useCartProfileSync.ts`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 收口用户资料同步逻辑**

抽出：
- 初次读取 `getUserInfo()` 回填表单
- 初始化 `historyAddrs`
- 打开弹窗后请求 `/api/user/address`
- 根据地址结果更新 `form`

**Step 2: CartModal 改为调用 hook**

要求：
- 不改变 `form` 结构
- 不改变 `historyAddrs` 的来源
- 不改变打开弹窗时的读取行为

---

### Task 2: 拆出 useCartOrderSubmit

**Files:**
- Create: `meituanAstro/src/components/cart-modal/useCartOrderSubmit.ts`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 收口 submitOrder 及其依赖逻辑**

抽出：
- 提交请求体组装
- delivery/dine_in 分支
- 微信支付分支
- 成功后购物车清理、状态复位

**Step 2: CartModal 改为通过 hook 获取 submitOrder**

要求：
- 不改现有按钮调用时机
- 不改成功后页面行为

---

### Task 3: 拆出 CartAuthPanel

**Files:**
- Create: `meituanAstro/src/components/cart-modal/CartAuthPanel.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取 step 2 登录/注册卡片区域**

提取当前外卖表单前面的认证卡片 UI。

**Step 2: 保持现有认证行为**

保留：
- `auth.isRegisterMode`
- `auth.handleLogin`
- `auth.handleRegister`
- `auth.handleGoogleSuccess`
- 错误提示与切换逻辑

---

### Task 4: 拆出 CartModeActions

**Files:**
- Create: `meituanAstro/src/components/cart-modal/CartModeActions.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 提取 step 1 堂食/外卖按钮区**

提取当前 `cart-action-btns` 区域。

**Step 2: 保持现有按钮行为**

保留：
- 堂食按钮逻辑
- 外卖按钮逻辑
- 店铺营业状态控制
- 外卖锁定提示文案

---

### Task 5: 静态复核与记录

**Files:**
- Modify: `docs/plans/2026-03-06-cartmodal-first-cut.md`

**Step 1: 记录完成范围**

记录已拆出的：
- `useCartProfileSync`
- `useCartOrderSubmit`
- `CartAuthPanel`
- `CartModeActions`

**Step 2: 记录后续范围**

后续再拆：
- remark 区域
- table modal 区域
- step 1 / step 2 主视图壳层
