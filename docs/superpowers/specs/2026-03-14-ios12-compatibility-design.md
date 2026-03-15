---
name: iOS 12.5.7 兼容性支持
description: 解决老旧 iOS 设备（最低 12.5.7）上管理后台与点餐页面的脚本失效及 UI 无响应问题。
type: project
---

# iOS 12.5.7 兼容性支持设计文档

## 1. 问题背景
用户反馈在较老旧的苹果手机（iOS 12.5.7）和平板上，商家管理后台（Admin）无法登录，点餐页面点击无反应。经初步排查，根源在于构建产物及源码中包含 iOS 12 不支持的现代 JS 语法（如可选链 `?.`、空值合并 `??`）以及缺失的 DOM API（如 `replaceChildren`）。

## 2. 目标 (Success Criteria)
- **商家端 (Admin)**：可以在 iOS 12.5.7 上成功登录并进行基本的订单处理、设置修改等操作。
- **点餐端 (Shop)**：顾客可以在 iOS 12.5.7 上正常浏览菜单、选桌、下单及查看订单状态。
- **性能平衡**：在不显著增加现代浏览器包体积的前提下，实现旧版兼容。

## 3. 技术方案 (Approach)

### 3.1 构建配置调整 (Vite Target)
通过修改 `astro.config.mjs` 中的 Vite 配置，强制将代码转译为 ES2015 级别。
- **修改点**：`vite.build.target` 设置为 `['es2015', 'ios12']`。
- **目的**：自动处理 `.ts`, `.tsx`, `.js` 文件中的 `?.` 和 `??` 语法。

### 3.2 运行时补丁 (Polyfills)
在全局布局文件 `Layout.astro` 的头部注入一个轻量级的兼容性脚本。
- **API 补丁**：
  - `Element.prototype.replaceChildren`：iOS 14+ 才支持，需手动实现高性能版本（`while + removeChild`）。
  - `Element.prototype.scrollTo`：解决旧版不支持对象参数及 `smooth` 行为的问题。
  - `AbortController`：iOS 12 不支持，需引入 Polyfill 以保证 API 请求取消功能正常。
  - `Object.fromEntries`：iOS 12 不支持，表单处理必备。
  - `Promise.prototype.finally`：确保构建转译覆盖或提供补丁。
- **实现方式**：在 `src/scripts/compat.js` 中编写，并通过 `is:inline` 方式在 `<head>` 最前方引入。

### 3.3 样式兼容性 (CSS Compatibility)
- **Flexbox Gap**：iOS 14.5 之前不支持 `gap` 属性。需检查关键布局并为旧设备提供 `margin` 降级方案。
- **Viewport Height**：使用 `-webkit-fill-available` 解决 iOS 上 `100vh` 包含工具栏的问题。

### 3.4 内联脚本与静态扫描 (Inline Script & Static Analysis)
`.astro` 文件中带有 `is:inline` 或 `define:vars` 的脚本块不会被 Vite 转译，必须手动重构为 ES5 兼容语法。
- **自动化保障**：在 `scripts/` 下增加/更新扫描工具，通过正则检测内联脚本中的 `?.` 和 `??` 语法，防止回归。
- **关键文件重构**：
  - `src/components/admin/AdminLoginForm.astro`：重写登录 AJAX 逻辑。
  - `src/pages/[slug]/index.astro`：重写实时同步逻辑。
  - `src/layouts/Layout.astro`：Service Worker 注册逻辑。

### 3.5 API 使用规范及其他风险控制
- 避免使用 `Promise.allSettled`（iOS 13+）。
- 避免直接在浏览器环境使用 `BigInt`。
- 优先使用传统的 `for` 循环或 `Array.prototype.forEach` 代替 `flatMap`（如果转译器未覆盖）。
- 禁用 iOS 12 下的 Service Worker：由于旧版支持极不稳定，考虑在 iOS 12 下直接跳过 SW 注册。

## 4. 实施计划 (Implementation Steps)
1. 修改 `astro.config.mjs` 构建配置。
2. 创建 `src/scripts/compat.js` 并在 `Layout.astro` 引入。
3. 扫描并重写 `.astro` 文件中的内联脚本现代语法。
4. 本地模拟低版本环境进行回归测试。

## 5. 风险评估
- **包体积**：转译会略微增加 JS 体积，但对于此类管理系统影响较小。
- **性能**：在极老旧设备上，复杂的 Polyfill 可能会影响 UI 流畅度，需保持代码精简。
