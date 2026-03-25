# Delivery Disabled Cart Button State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在店铺外卖关闭时，让购物车底部现有橙色外卖按钮改为 `Dostava nije dostupna / 外卖尚未开通` 并进入禁用态，不新增额外提示 UI。

**Architecture:** 保持前端优先，不改后端/BFF。`src/pages/[slug]/index.astro` 继续透传现有 `enableDelivery` 状态；虽然 spec 从 `CartModal.tsx` 角度描述这个按钮，但实际按钮渲染已下沉在 `src/components/cart-modal/CartModeActions.tsx`，因此应在这个单一渲染点完成文案、disabled 与点击保护切换，以等价满足 spec。测试继续沿用现有 `node:test` 轻量源码断言风格，不新增页面级重型测试基建。

**Tech Stack:** Astro, Preact, TypeScript, node:test

---

## File Map

### Modify
- `src/components/cart-modal/CartModeActions.tsx` — 统一外卖按钮关闭态文案、disabled 规则与点击保护
- `src/components/cart-modal/CartModal-step1-scroll.test.ts` — 增加购物车 step 1 源码级断言，锁定关闭态与开启态按钮契约

### Verify unchanged
- `src/components/CartModal.tsx` — 只作为 `CartModeActions` 的上层容器，不应为此任务做结构重构
- `src/pages/[slug]/index.astro` — 保持现有 `enableDelivery={enableDelivery}` 透传
- `src/components/cart-modal/CartDeliveryForm.tsx` — 不应因本任务改动

### References
- Spec: `docs/superpowers/specs/2026-03-25-delivery-disabled-cart-reminder-design.md`
- Existing button renderer: `src/components/cart-modal/CartModeActions.tsx`
- Existing cart source test: `src/components/cart-modal/CartModal-step1-scroll.test.ts`

---

### Task 1: 锁定外卖按钮关闭态与开启态契约

**Files:**
- Modify: `src/components/cart-modal/CartModal-step1-scroll.test.ts`
- Reference: `src/components/cart-modal/CartModeActions.tsx`
- Reference: `src/pages/[slug]/index.astro`

- [ ] **Step 1: 写失败测试，锁定关闭态与开启态源码契约**

在 `src/components/cart-modal/CartModal-step1-scroll.test.ts` 增加源码断言，要求：

```ts
assert.match(source, /const deliveryDisabled = totalCount === 0 \|\| !isShopOpen \|\| isDeliveryLocked \|\| !enableDelivery;/);
assert.match(source, /const deliveryLabel = !enableDelivery[\s\S]*"Dostava nije dostupna \/ 外卖尚未开通"[\s\S]*"🔒 外卖暂停"[\s\S]*"Dostava \/ 外卖"/);
assert.match(source, /\{!tableNumber && \(/);
assert.match(source, /disabled=\{deliveryDisabled\}/);
assert.match(source, /if \(deliveryDisabled\) return;/);
```

再补轻量页面接线断言，锁定：

```ts
assert.match(pageSource, /enableDelivery=\{enableDelivery\}/);
```

- [ ] **Step 2: 运行测试并确认先失败**

Run: `node --test src/components/cart-modal/CartModal-step1-scroll.test.ts`
Expected: FAIL，因为源码尚未包含新变量定义、关闭态文案或点击保护

- [ ] **Step 3: 仅补最小断言，不扩大测试范围**

保持测试只锁定：
- 关闭态按钮在 `!tableNumber` 时仍会渲染，不再被 `enableDelivery` 渲染门控直接隐藏
- 关闭态按钮文案出现
- 关闭态 disabled 逻辑包含 `!enableDelivery`
- 开启态文案仍为 `Dostava / 外卖`
- 页面仍透传 `enableDelivery={enableDelivery}`

- [ ] **Step 4: 重新运行测试确认通过**

Run: `node --test src/components/cart-modal/CartModal-step1-scroll.test.ts`
Expected: PASS

---

### Task 2: 实现按钮文案、禁用态与点击保护

**Files:**
- Modify: `src/components/cart-modal/CartModeActions.tsx`
- Verify: `src/components/CartModal.tsx`
- Verify: `src/pages/[slug]/index.astro`
- Test: `src/components/cart-modal/CartModal-step1-scroll.test.ts`

- [ ] **Step 1: 在按钮渲染点收口关闭态文案与禁用规则**

先把按钮渲染条件从 `enableDelivery && !tableNumber` 收口为仅由 `!tableNumber` 控制，确保外卖关闭时按钮仍可见；再把 `CartModeActions.tsx` 中按钮逻辑收口为：

```tsx
const deliveryDisabled = totalCount === 0 || !isShopOpen || isDeliveryLocked || !enableDelivery;
const deliveryLabel = !enableDelivery
  ? "Dostava nije dostupna / 外卖尚未开通"
  : isDeliveryLocked
    ? "🔒 外卖暂停"
    : "Dostava / 外卖";
```

约束：
- 外卖按钮在 step 1 且 `!tableNumber` 时必须继续渲染，不能因为 `enableDelivery === false` 被直接隐藏
- `!enableDelivery` 必须拥有最高文案优先级，只要外卖关闭就显示固定关闭文案
- `isDeliveryLocked` 文案与 title 行为在外卖开启前提下保留
- 不新增顶部提示条
- 不改 step 2 外卖表单
- 不新增专门样式改造

- [ ] **Step 2: 给按钮加 handler guard，避免关闭态误入外卖流程**

把现有：

```tsx
onClick={onStartDelivery}
```

改为：

```tsx
onClick={() => {
  if (deliveryDisabled) return;
  onStartDelivery();
}}
```

然后保持：

```tsx
disabled={deliveryDisabled}
title={!enableDelivery ? "" : isDeliveryLocked ? deliveryLockReason : ""}
```

- [ ] **Step 3: 运行 focused test 确认通过**

Run: `node --test src/components/cart-modal/CartModal-step1-scroll.test.ts`
Expected: PASS

- [ ] **Step 4: 运行购物车相关最小回归**

Run: `node --test src/styles/cart-action-spacing.test.ts src/styles/cart-modal-scrolling.test.ts src/components/cart-modal/CartModal-step1-scroll.test.ts`
Expected: PASS

---

### Task 3: 做最终验证并检查改动范围

**Files:**
- Verify: `src/components/cart-modal/CartModeActions.tsx`
- Verify: `src/components/cart-modal/CartModal-step1-scroll.test.ts`
- Verify: `src/components/CartModal.tsx`
- Verify: `src/pages/[slug]/index.astro`

- [ ] **Step 1: 运行最终回归**

Run: `node --test src/styles/cart-action-spacing.test.ts src/styles/cart-modal-scrolling.test.ts src/components/cart-modal/CartModal-step1-scroll.test.ts`
Expected: PASS

- [ ] **Step 2: 运行构建验证前端未被打坏**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: 检查 diff 控制范围**

Run: `git diff -- src/components/cart-modal/CartModeActions.tsx src/components/cart-modal/CartModal-step1-scroll.test.ts src/components/CartModal.tsx src/pages/[slug]/index.astro`
Expected: diff 仅限按钮文案、disabled 逻辑、点击保护与轻量测试

- [ ] **Step 4: 提交收尾**

```bash
git add src/components/cart-modal/CartModeActions.tsx src/components/cart-modal/CartModal-step1-scroll.test.ts
git commit -m "feat: disable unavailable delivery cart action"
```

---

## Notes for the implementing agent

- 不要新增顶部提醒条、toast、弹窗。
- 不要为了这个需求重构 `CartModal.tsx` 大块结构。
- 如果 `enableDelivery` 为 false，应该同时满足：
  - 按钮文案变为 `Dostava nije dostupna / 外卖尚未开通`
  - 按钮为 disabled
  - 点击处理不进入外卖流程
- `isDeliveryLocked` 现有文案与 title 行为保留，但仅在 `enableDelivery !== false` 时生效；只要外卖关闭，就应优先显示 `Dostava nije dostupna / 外卖尚未开通`。
- `src/pages/[slug]/index.astro` 若本身无需改动，可只通过轻量源码断言锁定其透传行为。
- 保持最小修改，不扩散到 `CartDeliveryForm.tsx` 或其他页面入口。

## Definition of Done

- 外卖关闭时，购物车底部橙色按钮显示 `Dostava nije dostupna / 外卖尚未开通`
- 同一按钮为 disabled
- 点击不会进入外卖 step 2
- 外卖开启时，按钮保持原文案 `Dostava / 外卖`
- 不新增额外提示 UI
- 不改后端/BFF
- 相关购物车测试与 `pnpm build` 均通过
