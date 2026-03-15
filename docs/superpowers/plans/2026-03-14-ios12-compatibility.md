# iOS 12.5.7 兼容性支持实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使商家端管理后台和点餐端页面在 iOS 12.5.7 (Safari) 上正常运行。

**Architecture:** 通过 Vite 配置进行语法降级，通过运行时 Polyfill 补全缺失 API，并重构不受 Vite 处理的内联脚本。

**Tech Stack:** Astro, Vite, Vanilla JS (ES5 target for compatibility).

---

## Chunk 1: 构建配置与基础 Polyfill

### Task 1: 配置 Vite 转译目标
**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: 修改 astro.config.mjs**
将 `vite.build.target` 设置为 `es2015` 以确保可选链和空值合并被转译。
```javascript
// astro.config.mjs
export default defineConfig({
  // ...
  vite: {
    build: {
      target: ['es2015', 'ios12'],
      cssTarget: 'chrome61',
    }
  }
});
```
- [ ] **Step 2: 验证构建产物**
运行 `pnpm build` 并检查 `dist/` 中的 JS 文件，确保不再包含 `?.` 语法。
- [ ] **Step 3: Commit**
```bash
git add astro.config.mjs
git commit -m "build: downgrade vite target for ios12 compatibility"
```

### Task 2: 实现运行时 Polyfill 与风险控制
**Files:**
- Create: `src/scripts/compat.js`
- Modify: `src/layouts/Layout.astro`

- [ ] **Step 1: 创建 compat.js**
实现以下补丁：
- `Object.fromEntries` (ES2019)
- `Promise.prototype.finally` (ES2018)
- `Element.prototype.replaceChildren` (iOS 14+): 使用 `while (el.firstChild) el.removeChild(el.firstChild); el.append.apply(el, arguments);` 实现。
- `AbortController`: 提供极简 Polyfill 或空操作支持。
- `scrollTo`: 兼容旧版不支持对象参数及 `smooth` 行为的情况。
- [ ] **Step 2: 在 Layout.astro 中引入并处理 SW**
使用 `is:inline` 将 `compat.js` 插入到 `<head>` 顶部。
修改 Service Worker 注册逻辑：如果检测到 iOS 12 (UA 判断)，则跳过 `navigator.serviceWorker.register`。
- [ ] **Step 3: Commit**
```bash
git add src/scripts/compat.js src/layouts/Layout.astro
git commit -m "feat: add polyfills and sw safety for ios12 compatibility"
```

---

## Chunk 2: 内联脚本重构 (Inline Scripts)

### Task 3: 重构 Admin 登录页脚本
**Files:**
- Modify: `src/components/admin/AdminLoginForm.astro`

- [ ] **Step 1: 手动重写 inline 脚本**
将所有 `?.`、`??` 和 `const/let` (视情况而定) 替换为兼容写法。
- [ ] **Step 2: Commit**
```bash
git add src/components/admin/AdminLoginForm.astro
git commit -m "fix: refactor admin login inline script for ios12"
```

### Task 4: 重构点餐页及公共脚本
**Files:**
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/layouts/Layout.astro` (内联部分)

- [ ] **Step 1: 手动重写 MQTT/EventSource 逻辑**
处理 `is:inline` 块中的现代语法，特别是 `JSON.parse(ev?.data || '{}')` 这种模式。
- [ ] **Step 2: Commit**
```bash
git add src/pages/[slug]/index.astro src/layouts/Layout.astro
git commit -m "fix: refactor public inline scripts for ios12"
```

---

## Chunk 3: 样式与自动化校验

### Task 5: 修复 CSS 兼容性
**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 处理 Flex Gap 降级**
针对不支持 `gap` 的容器（iOS 14.5-）增加 `margin` 补救。
- [ ] **Step 2: 处理 100vh 遮挡问题**
在关键容器（如 `Layout.astro` 中的 body/main）增加 `min-height: -webkit-fill-available;`。
- [ ] **Step 3: Commit**
```bash
git add src/styles/global.css
git commit -m "style: add css gap and vh fallbacks for old safari"
```

### Task 6: 建立语法扫描机制
**Files:**
- Modify: `scripts/check-no-unsafe-dom-apis.test.mjs`

- [ ] **Step 1: 增加对 ?. 和 ?? 的正则扫描**
确保 `src/` 下所有 `.astro` 中的内联脚本不包含现代语法。
- [ ] **Step 2: 构建后全量校验**
运行 `pnpm build && grep -r "\?." dist/` (排除非代码文件) 确保产物完全降级。
- [ ] **Step 3: Commit**
```bash
git add scripts/check-no-unsafe-dom-apis.test.mjs
git commit -m "test: add static analysis for es5 compatibility in inline scripts"
```

---

## Task 7: 集成验收
- [ ] **Step 1: 运行安全门禁测试**
`pnpm run test:security`
- [ ] **Step 2: 关键路径回归**
模拟低版本 UA 访问 `/admin/02/login` 和 `/[slug]`，验证基本交互。
- [ ] **Step 3: Commit**
```bash
git commit --allow-empty -m "chore: ios12 compatibility implementation complete"
```
