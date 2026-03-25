# Delivery Disabled Cart Button State Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在店铺外卖关闭时，直接复用购物车底部现有橙色外卖按钮，通过改文案和禁用态明确告知“外卖尚未开通”，避免新增额外提示 UI。

**Architecture:** 保持前端优先，不改后端/BFF。`src/pages/[slug]/index.astro` 继续复用现有 `enableDelivery` 状态并传给 `CartModal`；`src/components/CartModal.tsx` 只在购物车里基于 `enableDelivery === false` 切换底部外卖按钮的文案和 disabled 状态，不新增顶部提醒条、不改变其他流程。

**Tech Stack:** Astro, Preact, TypeScript, node:test source/UI regression tests

---

## Scope

### In scope
- 店铺页已有 `enableDelivery` 关闭时，购物车底部原有橙色外卖按钮改为关闭态展示
- 显示条件固定为：`CartModal` 已打开、当前停留在购物车主视图（step 1）、且 `enableDelivery === false`
- 关闭态按钮文案固定为：`Dostava nije dostupna / 外卖尚未开通`
- 关闭态按钮固定为禁用，不可点击
- 仅改前端按钮展示与禁用态，不新增弹窗、顶部提醒、跳转、后端字段或 API 变更

### Out of scope
- 不修改外卖提交流程本身
- 不新增额外提示条、toast、弹窗
- 不改变空购物车态、菜单页其他入口、admin/master 页面
- 不重构整个 CartModal 结构

---

## File targets

- `src/pages/[slug]/index.astro`
  - 继续使用现有 `enableDelivery` 计算结果
  - 继续把该状态传给 `CartModal`
- `src/components/CartModal.tsx`
  - 在 step 1 购物车视图中复用现有底部外卖按钮
  - 当 `enableDelivery === false` 时切换文案并设为禁用态
  - 最终禁用条件应为：`!enableDelivery || existingDisabledCondition`
  - 当 `!enableDelivery` 时，点击事件不得进入外卖流程
- 相关前端测试文件
  - 补最小测试覆盖：关闭态文案变化 + disabled；开启态保持原文案与可点击

---

## UX design

### Placement
- 位置保持不变：购物车底部原有橙色外卖按钮
- 不新增顶部提示，不打断当前界面结构

### Visual style
- 保持现有橙色按钮布局与位置
- 视觉以复用现有按钮组件与位置为准；disabled 后是否变灰由现有样式系统决定，不新增专门样式改造
- 不新增图标、不新增说明文字块

### Content
- 开启态维持原文案：`Dostava / 外卖`
- 关闭态固定文案：`Dostava nije dostupna / 外卖尚未开通`

---

## Data flow

1. `src/pages/[slug]/index.astro` 已有：
   - `const enableDelivery = Number(shop?.enable_delivery ?? 1) !== 0;`
2. 页面继续把 `enableDelivery` 传给 `CartModal`
3. `CartModal.tsx` 在购物车主视图里根据 `enableDelivery === false`：
   - 切换外卖按钮文案
   - 设置按钮为 disabled
4. 除按钮文案与禁用态外，不改购物车 store、表单状态、提交流程、模式切换

---

## Testing

至少覆盖：
- `CartModal` 条件渲染：外卖关闭时底部按钮显示 `Dostava nije dostupna / 外卖尚未开通`
- `CartModal` 条件渲染：外卖关闭时底部按钮为 disabled
- `CartModal` 条件渲染：外卖开启时底部按钮仍显示 `Dostava / 外卖` 且不为 disabled
- `src/pages/[slug]/index.astro` 保持现有 `enableDelivery` 透传的轻量源码断言即可，不新增重型页面测试基建

优先使用当前代码库已有的轻量测试风格与 `node:test`，不新增 E2E 或大型测试基建。

---

## Acceptance criteria

- `http://localhost:3000/101` 对应的店铺若外卖关闭，打开购物车时底部橙色按钮显示 `Dostava nije dostupna / 外卖尚未开通`
- 同一按钮在关闭态为 disabled，不可点击
- 外卖开启时，底部按钮仍保持 `Dostava / 外卖` 和原有可点击状态
- 不新增顶部提示条、弹窗或跳转
- 不改变提交流程、模式切换、埋点或接口字段
- 不改后端/BFF
- 现有页面和构建测试保持通过
