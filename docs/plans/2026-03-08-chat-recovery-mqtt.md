# Chat Recovery MQTT Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 恢复用户与商家的聊天功能，基于现有 HTTP 接口与 MQTT 实时能力完成完整双向聊天闭环。

**Architecture:** 用户侧与商家侧都采用“HTTP 拉历史 + MQTT 收实时”的组合模式。前端新增本地 API 代理层，统一复用项目现有 request/response/proxy 基础设施；聊天 UI 通过用户组件与 admin 模块分别挂载，避免再把逻辑塞回大脚本文件。

**Tech Stack:** Astro, TypeScript, pnpm, MQTT(Paho), existing Go chat API

---

### Task 1: 建立聊天 API 代理层

**Files:**
- Create: `src/pages/api/user/chat.ts`
- Create: `src/pages/api/admin/chat.ts`
- Modify: `src/lib/validation.ts`

**Step 1: 增加聊天请求/查询 schema**

为用户聊天与商家聊天分别定义 query/body schema。

**Step 2: 实现本地代理路由**

让用户侧与商家侧都走本地 `/api/.../chat`，并接入统一 request/response helper。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 2: 恢复用户聊天组件

**Files:**
- Create: `src/components/UserChat.astro`
- Modify: `src/pages/messages/index.astro`

**Step 1: 挂载聊天页面容器**

把 `/messages` 从静态空壳改成真实聊天页面。

**Step 2: 实现用户聊天逻辑**

包括：
- 拉历史消息
- 发送消息
- MQTT 实时接收
- 滚动到底部
- 登录态检查

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 3: 恢复用户侧客服入口

**Files:**
- Modify: `src/pages/user/service.astro`

**Step 1: 让客服按钮进入聊天页**

不再只是静态按钮，改为真正可进入聊天中心。

**Step 2: 保持现有视觉结构尽量稳定**

只改行为，不做大幅样式重写。

**Step 3: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 4: 恢复商家聊天脚本

**Files:**
- Create: `src/scripts/admin/user-chat.ts`
- Modify: `src/components/admin/AdminScripts.astro`
- Modify: `src/components/admin/TabCustomers.astro` 或对应 admin tab 文件

**Step 1: 增加 admin 聊天面板 UI 容器**

至少包含：
- 用户列表区
- 当前会话标题
- 消息列表区
- 输入框与发送按钮

**Step 2: 实现商家聊天逻辑**

包括：
- 拉最近会话列表
- 选中用户加载历史
- 发送商家消息
- MQTT 实时接收用户消息

**Step 3: 接入 admin 装配层**

把该模块接到当前模块化后的 admin 脚本体系里。

**Step 4: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 5: 验证 MQTT 实时闭环

**Files:**
- Test: `src/components/UserChat.astro`
- Test: `src/scripts/admin/user-chat.ts`

**Step 1: 用户发送，商家实时接收**

验证商家端无需刷新即可看到新消息。

**Step 2: 商家发送，用户实时接收**

验证用户端无需刷新即可看到新消息。

**Step 3: MQTT 失败兜底**

确认 MQTT 不可用时，至少历史加载与发送功能仍可工作。

### Task 6: 全量验证

**Files:**
- Test: `package.json`

**Step 1: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

**Step 2: 手工 smoke check**

检查：
- `/messages`
- `/user/service`
- admin 客户聊天面板

**Step 3: 功能闭环验证**

确认：
- 用户历史消息可加载
- 商家历史消息可加载
- 双向实时消息可用
