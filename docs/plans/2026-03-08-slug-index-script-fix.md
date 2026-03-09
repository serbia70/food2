# Slug Index Script Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `src/pages/[slug]/index.astro` 中导致 Vite/esbuild 依赖扫描失败的脚本注入语法错误。

**Architecture:** 在 Astro frontmatter 中先把页面需要注入到浏览器脚本的数据序列化为可直接嵌入的 JS 字面量字符串，然后在 `<script type="module">` 中使用合法 JavaScript 调用初始化函数。避免在普通脚本体中直接写 `${...}` 模板占位。

**Tech Stack:** Astro, Vite, esbuild, pnpm

---

### Task 1: 修复页面脚本注入

**Files:**
- Modify: `src/pages/[slug]/index.astro`
- Test: `pnpm run dev`

**Step 1: 写最小修复方案**

在 frontmatter 中新增用于脚本注入的序列化常量，覆盖 `slug`、`endedStatusList`、`belgradeTimeOptions`。

**Step 2: 替换非法脚本写法**

把 `<script type="module">` 中的 `${...}` 形式改为直接输出合法对象字面量值。

**Step 3: 运行开发服务验证**

Run: `pnpm run dev`
Expected: 不再出现 `Expected "}" but found "{"`，Vite 能正常完成入口扫描。
