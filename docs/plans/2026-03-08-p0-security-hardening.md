# P0 Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 收紧前后端敏感凭据边界，移除前端明文凭据存储，并修复管理登录会话暴露问题。

**Architecture:** 前端不再依赖 `PUBLIC_MASTER_TOKEN`、`PUBLIC_DEFAULT_USER_PASSWORD`、公开 MQTT 用户名密码这类敏感配置；服务端代理层不再自动补高权限鉴权头，而是要求显式已认证请求。登录态统一通过 HttpOnly Cookie 承载，前端本地存储只保留最小必要用户资料，不再保存明文密码。

**Tech Stack:** Astro, Preact, TypeScript, pnpm

---

### Task 1: 移除前端主控令牌依赖

**Files:**
- Modify: `src/config.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/pages/[slug]/order-view/[order_no].astro`
- Modify: `src/pages/admin/[slug]/index.astro`

**Step 1: 写最小回归验证说明**

确认首页、门店页、订单查看页、后台页中哪些数据真正需要 master 接口，哪些可以降级为空或走本地受控 API。

**Step 2: 删除 `MASTER_TOKEN` 前端导出**

让 `src/config.ts` 仅保留安全的公开配置，移除前端可见主控 token。

**Step 3: 最小改造使用点**

把依赖 `MASTER_TOKEN` 的页面改为：
- 只读取公开信息，或
- 调本地受控 API，或
- 安全降级为空数据

**Step 4: 运行开发服务验证页面可启动**

Run: `pnpm run dev`
Expected: 开发服务正常启动，相关页面不因缺少 `MASTER_TOKEN` 报构建或运行错误。

### Task 2: 收紧 master 代理鉴权边界

**Files:**
- Modify: `src/pages/api/master/init.ts`
- Modify: `src/pages/api/master/manage.ts`
- Modify: `src/pages/api/master/upload.ts`
- Modify: `src/pages/api/master/restore.ts`
- Modify: `src/pages/api/master/backup.ts`

**Step 1: 写失败场景验证**

明确无 `Authorization` 请求访问 `/api/master/*` 时应返回 401，而不是自动兜底授权。

**Step 2: 删除默认 `MASTER_TOKEN` 回退**

所有 master 代理必须要求显式授权头；没有则直接拒绝。

**Step 3: 统一错误结构**

未授权统一返回 JSON 错误结构，减少前端分支混乱。

**Step 4: 验证未授权行为**

Run: 用浏览器或 `fetch` 访问本地 `/api/master/*`
Expected: 未带鉴权头时返回 401 JSON。

### Task 3: 修复管理登录会话暴露

**Files:**
- Modify: `src/pages/api/admin/login.ts`

**Step 1: 写目标行为说明**

登录成功后仅设置 HttpOnly Cookie，不再把 token 暴露给前端响应体。

**Step 2: 最小修改登录响应**

移除 `token` 返回字段，并让 `secure` 基于环境决定。

**Step 3: 验证登录接口响应格式**

Run: `pnpm run dev` 后调用登录接口
Expected: 成功响应不含 `token` 字段，Cookie 属性符合预期。

### Task 4: 移除前端明文密码默认值与持久化

**Files:**
- Modify: `src/lib/clientConfig.ts`
- Modify: `src/lib/userStore.ts`
- Modify: `src/components/CartModal.tsx`
- Modify: `src/components/UserModal.tsx`
- Modify: `src/components/cart-modal/useAuthState.ts`

**Step 1: 写回归验证说明**

明确用户本地资料仍可保留姓名、电话、地址、头像，但不再保存默认密码或明文密码。

**Step 2: 删除 `DEFAULT_USER_PASSWORD` 公开配置**

让前端不再依赖公开默认密码。

**Step 3: 重写本地用户存储结构**

移除 `password` 字段的默认值、读取回填和持久化逻辑。

**Step 4: 修复登录/Google 登录调用点**

保留登录流程，但 `saveUserInfo` 只保存最小必要资料。

**Step 5: 验证登录后本地存储内容**

Run: 本地登录/Google 登录流程
Expected: `localStorage` 中不再出现用户明文密码。

### Task 5: 全量验证

**Files:**
- Test: `package.json`

**Step 1: 启动开发服务**

Run: `pnpm run dev`
Expected: 正常启动，无新增构建错误。

**Step 2: 核查关键页面**

打开：
- `http://localhost:3000/`
- `http://localhost:3000/admin/02`
- `http://localhost:3000/02`

Expected: 页面可打开，关键数据缺失时走安全降级而不是崩溃。

**Step 3: 核查关键安全结果**

检查：
- 前端构建代码中不再导出 `MASTER_TOKEN`
- `localStorage` 不再保存明文密码
- 管理登录响应体不再包含 `token`
