# Security Hardening And Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收紧认证与敏感信息暴露边界，修复明显测试缺口，补齐基础验证脚本与文档漂移，并清理仓库污染。

**Architecture:** 先做不依赖后端联动的大头风险收口：前端不再收到 admin/master token，master impersonate 禁止 GET 改状态，用户侧不再持久化默认密码和伪 session。随后限制 admin 前端运行时仅拿必要设置，修复测试脚本与失败断言，最后清理文档与仓库污染，保证改动可验证。

**Tech Stack:** Astro 5, TypeScript, Preact, node:test, pnpm, Cloudflare adapter

---

### Task 1: 收紧 admin/master 会话响应

**Files:**
- Modify: `src/application/auth/load-session-query.ts`
- Modify: `src/pages/api/admin/login.ts`
- Modify: `src/pages/api/master/login.ts`
- Modify: `src/pages/api/auth/check.ts`
- Modify: `src/pages/api/master/impersonate-shop.ts`
- Test: `pnpm build`

- [x] 删除 `SessionPayload.token`
- [x] admin/master 登录接口仅返回 `kind/isAuthenticated/userId/displayName`
- [x] `auth/check` 不再回显 token
- [x] `impersonate-shop` 只保留 POST，且响应不再返回 token
- [x] 跑构建验证

### Task 2: 收紧用户端本地认证持久化

**Files:**
- Modify: `src/lib/clientConfig.ts`
- Modify: `src/lib/userStore.ts`
- Modify: `src/lib/user-auth.ts`
- Modify: `src/lib/user-auth-browser.ts`
- Modify: `src/components/UserModal.tsx`
- Modify: `src/components/cart-modal/useAuthState.ts`
- Modify: `src/components/cart-modal/useCartProfileSync.ts`
- Modify: `src/pages/user/login.astro`
- Test: `pnpm build`

- [x] 去掉默认密码 fallback 和本地 password 持久化
- [x] 仅在后端显式返回 `sessionToken` 时保存 session
- [x] 登录/注册后历史和地址读取改为优先使用真实 session，不再伪造 phone/email token
- [x] 跑构建验证

### Task 3: 缩小 admin 前端运行时暴露面

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/AdminScripts.astro`
- Modify: `src/scripts/admin/globals.ts`
- Modify: `src/scripts/admin/order-actions.ts`
- Modify: `src/scripts/admin/admin-entry.ts`
- Test: `pnpm build`

- [x] 仅向浏览器注入必要的非敏感 settings
- [x] 不再向前端暴露 Telegram token 类字段
- [x] 保持现有设置页保存流程可用
- [x] 跑构建验证

### Task 4: 修测试入口与失败断言

**Files:**
- Modify: `package.json`
- Modify: `src/lib/rider-action-route-spec.ts`
- Test: `pnpm run test:security`

- [x] 把遗漏的 spec 纳入测试脚本
- [x] 修正 `picked_up` 相关时间断言，使其与当前展示格式一致
- [x] 跑安全测试直到全绿

### Task 5: 修环境/文档漂移并清仓库污染

**Files:**
- Modify: `src/env.d.ts`
- Modify: `.env.example`
- Modify: `DEPLOY.md`
- Delete: `scripts/debug-shop-103-cdp.mjs`
- Delete: `meituan.db`
- Test: `pnpm build && pnpm run test:security`

- [x] 补齐当前真实使用的公共 env 类型与样例
- [x] 部署文档统一为 pnpm
- [x] 删除明显调试脚本和空数据库污染
- [x] 跑最终验证
