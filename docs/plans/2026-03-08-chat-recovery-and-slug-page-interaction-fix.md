# Chat Recovery And Slug Page Interaction Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 `http://localhost:3000/02` 页面按钮无响应问题，并在同一轮中恢复用户与商家聊天功能（含 MQTT 实时）。

**Architecture:** 先修复 `[slug]` 前台页面交互入口，确保 table-page 初始化能够可靠挂载按钮行为；再基于现有 Go 聊天接口与 MQTT 发布能力，恢复用户侧 `/messages` 与 admin 聊天面板，采用“HTTP 拉历史 + MQTT 收实时”的模式，避免重新发明协议与服务。

**Tech Stack:** Astro, TypeScript, pnpm, MQTT(Paho), existing Go chat API

---

### Task 1: 修复 `[slug]` 页面交互入口

**Files:**
- Modify: `src/scripts/shop/table-page.ts`
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/scripts/shop/table-actions.ts`

**Step 1: 写最小失败验证说明**

确认 `/02` 页面的以下按钮当前无响应：
- 预约
- 外卖
- 开台
- 加菜
- 查看详情

**Step 2: 修复脚本初始化链路**

确保 `initTablePage()` 在浏览器端稳定执行，并能可靠把函数挂到 `window`。

**Step 3: 保持旧按钮行为不变**

不重做页面布局，只恢复现有按钮交互。

**Step 4: 运行构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 2: 建立聊天 API 代理层

**Files:**
- Create: `src/pages/api/user/chat.ts`
- Create: `src/pages/api/admin/chat.ts`
- Modify: `src/lib/validation.ts`

**Step 1: 增加聊天 query/body schema**

定义用户聊天与商家聊天所需参数 schema。

**Step 2: 新建前端代理接口**

让聊天统一走本地 `/api/user/chat` 与 `/api/admin/chat`。

**Step 3: 运行构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 3: 恢复用户聊天页

**Files:**
- Create: `src/components/UserChat.astro`
- Modify: `src/pages/messages/index.astro`
- Modify: `src/pages/user/service.astro`

**Step 1: 把 `/messages` 从静态空页改为聊天页**

挂载聊天组件与消息列表容器。

**Step 2: 实现用户聊天逻辑**

支持：
- 加载历史
- 发送消息
- MQTT 实时接收
- 登录态检查

**Step 3: 让“联系客服”入口进入聊天**

确保用户中心服务页不再只是静态按钮。

**Step 4: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 4: 恢复商家聊天面板

**Files:**
- Create: `src/scripts/admin/user-chat.ts`
- Modify: `src/components/admin/AdminScripts.astro`
- Modify: `src/components/admin/TabCustomers.astro` 或对应 admin tab 文件

**Step 1: 增加聊天容器 UI**

至少包含：
- 用户会话列表
- 当前聊天标题
- 消息区
- 输入框与发送按钮

**Step 2: 实现 admin 聊天逻辑**

支持：
- 拉取会话
- 打开某手机号聊天记录
- 发送商家消息
- MQTT 实时接收用户消息

**Step 3: 接入现有模块化 admin 架构**

通过独立模块挂载，不把聊天逻辑塞回 `AdminScripts.astro`。

**Step 4: 构建验证**

Run: `pnpm run build`
Expected: 构建通过。

### Task 5: 验证双向聊天闭环

**Files:**
- Test: `src/components/UserChat.astro`
- Test: `src/scripts/admin/user-chat.ts`

**Step 1: 用户发送，商家实时接收**

验证 MQTT 推送到 admin。

**Step 2: 商家发送，用户实时接收**

验证 MQTT 推送到用户聊天页。

**Step 3: MQTT 不可用时的基础可用性**

确认历史消息与发送仍可用。

### Task 6: 联合验证

**Files:**
- Test: `package.json`

**Step 1: 运行构建**

Run: `pnpm run build`
Expected: 构建通过。

**Step 2: 手工验证关键页面**

打开并验证：
- `http://localhost:3000/02`
- `http://localhost:3000/messages`
- admin 聊天面板

**Step 3: 确认恢复结果**

检查：
- `/02` 页面按钮恢复响应
- 用户侧聊天可发送/接收
- 商家侧聊天可发送/接收
