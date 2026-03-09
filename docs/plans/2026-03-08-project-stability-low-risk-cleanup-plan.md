# Project Stability Low Risk Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变核心业务行为的前提下，完成一轮低风险稳健性治理，减少重复代码、历史残留和高耦合入口，让后续修改更不容易出错。

**Architecture:** 本轮不做大拆大改，只做“收口”和“减面”。前端优先统一登录入口、抽公共桌台规则、减少全局桥接和重复代理模式；后端优先收口兼容层边界、抽公共 helper 和统一数据契约入口。所有任务都以“行为不变、改动可验证、便于继续分波推进”为原则。

**Tech Stack:** Astro, TypeScript, Preact, Go, Gin, sqlx, SQLite, pnpm

---

### Task 1: 建立前端低风险清理基线

**Files:**
- Modify: `meituanAstro/package.json`
- Modify: `meituanAstro/README.md`
- Modify: `docs/plans/2026-03-08-project-stability-low-risk-cleanup-plan.md`

**Step 1: 记录当前开发启动现状**

```text
基线记录：
1. `pnpm run dev` 当前因 node_modules 状态异常失败
2. README 中后台路由描述与现状不完全一致
3. 本轮清理目标是“结构稳健性”，不是功能重写
```

**Step 2: 在 README 补充当前真实入口**

明确记录：

```text
前端后台页：/admin/[slug]
后台登录页：/admin/[slug]/login
旧路径 /[slug]/admin 仅为兼容跳转
```

**Step 3: 在 package.json 补充安全重装依赖说明（如果 README 更合适也可只放 README）**

建议写明：

```text
若 pnpm install 因旧 node_modules 状态异常失败，先删除 node_modules 再执行 pnpm install
```

**Step 4: 手工验证**

```bash
pnpm install
pnpm run dev
```

Expected: 前端开发服务可启动，或至少错误信息不再是缺失 astro 模块。

---

### Task 2: 合并后台登录页重复代码

**Files:**
- Create: `meituanAstro/src/components/admin/AdminLoginForm.astro`
- Modify: `meituanAstro/src/pages/admin/index.astro`
- Modify: `meituanAstro/src/pages/admin/[slug]/login.astro`
- Test: 手工验证 `/admin` 与 `/admin/02/login`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. `/admin` 与 `/admin/02/login` 样式和提交逻辑几乎重复
2. 两页都提交到 `/api/admin/login`
3. 两页都在成功后跳转到 `/admin/${slug}`
```

**Step 2: 抽公共登录表单组件**

组件至少接收：

```ts
slug?: string
readonlySlug?: boolean
title: string
subtitle: string
manifestHref?: string
swScope?: string
```

**Step 3: 统一提交逻辑**

在组件内只保留一套：

```ts
fetch('/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shopId: slug, password }),
})
```

**Step 4: 去掉无意义的 token 本地存储**

删除：

```ts
localStorage.setItem('token', data.token || '')
```

保留 `slug` 本地记忆仅在确实有页面使用时再决定；若未使用则一并删除。

**Step 5: 手工验证**

```text
1. 访问 /admin
2. 访问 /admin/02/login
3. 两页样式一致、错误提示一致
4. 登录成功后都跳到 /admin/{slug}
5. 页面只依赖 cookie，不再依赖 localStorage token
```

---

### Task 3: 抽后台桌台匹配共享规则

**Files:**
- Create: `meituanAstro/src/lib/admin-table-ref.ts`
- Modify: `meituanAstro/src/pages/admin/[slug]/index.astro`
- Modify: `meituanAstro/src/scripts/admin/table-management.ts`
- Test: 手工验证后台桌台匹配

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. 页面服务端和后台脚本各自维护 parseTableRef / inferLegacySimpleHallNumber
2. 这是同一业务规则的重复实现
3. 目标是提取单一来源，不改现有匹配结果
```

**Step 2: 新增共享工具**

至少包含：

```ts
export function parseTableRef(input: unknown): { area: string; number: string; key: string }
export function inferLegacySimpleHallNumber(raw: unknown, maxCount: number): string
export function orderMatchesTable(...): boolean
```

**Step 3: 页面入口改用共享函数**

替换：
- `meituanAstro/src/pages/admin/[slug]/index.astro`

只替换规则函数，不改页面数据获取顺序。

**Step 4: 后台脚本改用共享函数**

替换：
- `meituanAstro/src/scripts/admin/table-management.ts`

只替换解析和匹配函数，不改 UI 行为。

**Step 5: 手工验证**

```text
1. 打开 /admin/02
2. 查看有订单的桌台卡片
3. 打开桌台详情、编辑、备注、结账流程
4. 确认与改造前匹配结果一致
```

---

### Task 4: 收口前端 admin 全局桥接入口

**Files:**
- Create: `meituanAstro/src/scripts/admin/globals.ts`
- Modify: `meituanAstro/src/scripts/admin/admin-entry.ts`
- Modify: `meituanAstro/src/components/admin/AdminScripts.astro`
- Modify: `meituanAstro/src/scripts/admin/core.ts`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. AdminScripts.astro 往 window 挂运行时数据
2. admin-entry.ts 往 window 挂大量动作函数
3. 目标不是消灭 window，而是集中管理出口
```

**Step 2: 新增 globals 模块**

统一管理：

```ts
type AdminRuntimeState = {
  shopId: number
  shopSlug: string
  tableConfig: unknown
  settings: unknown
  brokerIp: string
  shop: unknown
}

export function setAdminRuntimeState(state: AdminRuntimeState): void
export function getAdminRuntimeState(): AdminRuntimeState
export function registerAdminGlobal(name: string, handler: Function): void
```

**Step 3: AdminScripts 改为调用集中入口**

不要继续散落：

```ts
window.shopId = shopId
window.shopSlug = shopSlug
window.currentSettings = settings
```

改为通过模块化入口设置运行时状态。

**Step 4: admin-entry 改为集中注册全局动作**

把几十个 `win.xxx = ...` 收口到统一注册函数中。

**Step 5: 手工验证**

```text
1. tab 切换正常
2. 退出登录正常
3. 上传图片正常
4. 聊天、订单编辑、费用页入口正常
5. 控制台无新增未定义错误
```

---

### Task 5: 统一 Astro admin 代理模式

**Files:**
- Create: `meituanAstro/src/lib/admin-api-route.ts`
- Modify: `meituanAstro/src/pages/api/admin/status.ts`
- Modify: `meituanAstro/src/pages/api/admin/billing.ts`
- Modify: `meituanAstro/src/pages/api/admin/orders.ts`
- Modify: `meituanAstro/src/pages/api/admin/*.ts`（仅同模式文件，逐步替换）

**Step 1: 写最小失败验证（静态）**

```text
记录现状：
1. 多个 admin 代理文件重复读取 cookieToken
2. 多个文件重复拼 Authorization
3. 个别文件混入业务结构修补
```

**Step 2: 新增通用代理 helper**

至少提供：

```ts
export function buildAdminAuthHeader(request: Request, cookies: AstroCookies): Record<string, string>
export async function proxyAdminRequest(...): Promise<Response>
```

**Step 3: 先替换纯透传文件**

优先替换：
- `status.ts`
- `billing.ts`
- `chat.ts`
- `customers.ts`（纯透传部分）

**Step 4: 标记特殊文件**

`orders.ts` 当前会修补 `items_json`，先保留行为，但在文件顶部明确标注：

```ts
// TODO: 移除代理层业务修补，待后端稳定输出订单 items_json 后删除
```

**Step 5: 手工验证**

```text
1. /admin/02 首屏可正常加载
2. 订单、账单、客户、聊天接口响应不变
3. 401 时仍能正确跳回登录页
```

---

### Task 6: 收口后端 shop 基础 helper

**Files:**
- Update: `meituanGo/internal/handlers/shop_helpers.go`
- Modify: `meituanGo/internal/handlers/auth.go`
- Modify: `meituanGo/internal/handlers/order.go`
- Modify: `meituanGo/internal/handlers/menu.go`
- Modify: `meituanGo/internal/handlers/reservation.go`

**Step 1: 写最小失败验证（静态）**

```text
记录现状：
1. 多个 handler 自己查 shop 或 shop_id
2. 同类 SQL 到处散落
3. 本任务只抽公共 helper，不改接口语义
```

**Step 2: 新增或扩充 helper**

至少包含：

```go
func getShopIDBySlug(slug string) (int64, error)
func getShopBasicAuthBySlug(slug string) (db.Shop, error)
func getShopSettingsRaw(shopID int64) (string, error)
```

**Step 3: 替换最直白的重复查询**

优先把：

```go
SELECT id FROM shops WHERE slug = ?
SELECT id, password FROM shops WHERE slug = ?
```

替换为 helper 调用。

**Step 4: 手工验证**

```text
1. 登录仍返回原结果
2. 下单仍可查到 shop
3. 菜单、预约仍能按 slug 工作
4. 所有返回码保持不变
```

---

### Task 7: 给后端兼容层立边界并标注待删点

**Files:**
- Modify: `meituanGo/internal/handlers/admin_compat.go`
- Modify: `meituanGo/cmd/server/main.go`
- Modify: `docs/plans/2026-03-08-project-stability-low-risk-cleanup-plan.md`

**Step 1: 写最小失败验证（静态）**

```text
记录现状：
1. admin_compat.go 承担历史兼容入口
2. 当前风险不在于它存在，而在于它继续扩散
```

**Step 2: 在 main.go 中给兼容路由加明确注释**

例如：

```go
// Deprecated: backward-compatible admin path for legacy clients only.
```

**Step 3: 在 admin_compat.go 顶部补边界说明**

明确：
- 只允许兼容旧客户端
- 不再新增新业务逻辑
- 新功能必须进入正式 handler

**Step 4: 在计划文档末尾维护待删清单**

格式：

```text
- legacy order status path
- localStorage token residual logic
- proxy-layer items_json normalization
```

**Step 5: 手工验证**

```text
1. 现有兼容路径仍可工作
2. 代码阅读者能一眼看出哪些是历史债，不会继续往里塞新逻辑
```

---

### Task 8: 建立第一版“可删除代码清单”

**Files:**
- Modify: `docs/plans/2026-03-08-project-stability-low-risk-cleanup-plan.md`
- Modify: `meituanAstro/README.md`

**Step 1: 逐项登记立即可删或待验证可删项**

至少包含两类：

```text
立即可删：已被新公共实现替代的重复函数
待验证可删：仍可能被旧页面依赖的 localStorage / 兼容逻辑
```

**Step 2: 文档中写清删除条件**

示例：

```text
删除 localStorage token 的条件：全站 admin 页面只通过 admin_token cookie 认证，且搜索无读取 token 逻辑。
```

**Step 3: 手工验证**

```text
1. 清单中的每一项都有“位置 + 删除条件”
2. 后续改造时可以按清单逐项移除，而不是靠记忆
```

---

### Task 9: 验证和结果记录

**Files:**
- Modify: `docs/plans/2026-03-08-project-stability-low-risk-cleanup-plan.md`

**Step 1: 运行前端验证**

```bash
pnpm install
pnpm run build
```

Expected: build 成功；若失败，记录失败文件和原因。

**Step 2: 运行后端验证**

```bash
go test ./...
```

Expected: 测试通过；若失败，记录失败包和原因。

**Step 3: 记录结果**

文档末尾补充：
- 已完成范围
- 未完成范围
- 保留的技术债
- 下一波建议（拆 admin-entry / billing / promotions）

**Step 4: Commit**

```bash
git add docs/plans/2026-03-08-project-stability-low-risk-cleanup-plan.md
git commit -m "docs: add low risk stability cleanup plan"
```

---

## 当前待删清单（第一版）

### 立即可删

- `meituanAstro/src/pages/admin/index.astro` 与 `meituanAstro/src/pages/admin/[slug]/login.astro` 中旧的重复登录表单实现
  - 状态：已被 `meituanAstro/src/components/admin/AdminLoginForm.astro` 替代
  - 删除条件：已完成，可不再回滚到双页复制模式

- `meituanAstro/src/pages/admin/[slug]/index.astro`、`meituanAstro/src/scripts/admin/table-management.ts`、`meituanAstro/src/scripts/admin/table-utils.ts`、`meituanAstro/src/components/admin/TabTables.astro` 中旧的桌台解析重复实现
  - 状态：已被 `meituanAstro/src/lib/admin-table-ref.ts` 替代
  - 删除条件：已完成，后续不得重新复制 `parseTableRef` / `inferLegacySimpleHallNumber`

- `meituanAstro/src/components/admin/AdminScripts.astro` 中旧的 `window.shopId` / `window.shopSlug` / `window.tableConfig` / `window.currentSettings` / `window.brokerIp` / `window.mqttSecret` 直接注入模式
  - 状态：已被 `window.__adminRuntime` 取代
  - 删除条件：已完成，新增运行时数据只允许通过 `meituanAstro/src/scripts/admin/globals.ts` 收口

### 待验证可删

- `meituanAstro/src/pages/api/admin/orders.ts` 中代理层 `items_json` 结构修补
  - 状态：保留中
  - 删除条件：后端稳定输出统一订单结构，前端不再依赖代理层归一化

- `meituanGo/internal/handlers/admin_compat.go` 中 legacy action 分发逻辑
  - 状态：保留中
  - 删除条件：确认旧版 admin 客户端不再依赖 `/api/admin/update`

- `meituanGo/cmd/server/main.go:223` 的旧订单状态兼容路径 `/api/admin/orders/:id/status`
  - 状态：保留中
  - 删除条件：前端与旧客户端全部改用 `/api/admin/orders/:id`

- `meituanAstro/src/pages/merchant/login.astro` 中 `localStorage.setItem('token', ...)`
  - 状态：保留中
  - 删除条件：确认 merchant 端认证也已完全改为 cookie 或统一 token 方案

## 当前执行记录

### 已完成范围

- 合并 admin 登录页重复实现，移除 admin token 本地存储残留
- 抽桌台匹配共享规则，收口多处重复解析逻辑
- 收口 admin 全局运行时与动作注册入口
- 统一一批纯透传型 Astro admin 代理路由
- 收口后端按 slug 读取 shop 基础认证信息的 helper
- 给兼容层与兼容路由补边界说明，避免继续扩散
- 继续拆分 `meituanAstro/src/scripts/admin/admin-entry.ts`，将费用页 UI、设置页初始化、订单编辑 UI 逐步外移
- 消除 `meituanAstro/src/scripts/admin/table-actions.ts` 在 `admin-entry.ts` 中的静态 + 动态双重引入 warning
- 抽取 `meituanGo/internal/handlers/promotions.go` 中重复的促销 payload 构建逻辑（时间解析、商品 ID 序列化）
- 抽取 `meituanGo/internal/handlers/billing.go` 中余额调整与 ledger 写入 helper，减少事务内重复 SQL 模式

### 未完成范围

- `admin-entry.ts` 仍然偏大，尚未按业务块继续拆分
- `billing.go`、`promotions.go`、`admin_compat.go` 仍未完成真正分层
- admin 代理层尚未全部统一，特殊路由仍需逐个收口
- 兼容路径尚未下线，只是被标记和约束

### 保留的技术债

- `meituanAstro/src/pages/api/admin/orders.ts` 仍在代理层修补订单结构
- `meituanGo/internal/handlers/admin_compat.go` 仍承担 legacy action 聚合职责
- `meituanAstro/src/scripts/admin/admin-entry.ts` 仍偏大，虽然已拆出部分 UI 逻辑，但还可继续切分事件与状态管理
- `meituanGo/internal/handlers/billing.go` 仍未完成 service/repository 级别拆分，目前只完成了事务与 ledger 写入的第一轮收口
- `meituanGo/internal/handlers/master_routes_test.go` 当前测试依赖 `MasterShopDetail`，仓库已有失败
- `meituanGo/internal/services/cron/order_retention_test.go` 当前测试断言失败，仓库已有失败

### 下一波建议

- 拆 `meituanAstro/src/scripts/admin/admin-entry.ts`，消除 `table-actions.ts` 双重引入 warning
- 优先拆 `meituanGo/internal/handlers/billing.go`，抽 service/repository
- 优先拆 `meituanGo/internal/handlers/promotions.go`，减少 handler 内 SQL 和流程耦合
- 在兼容客户端退场后，删除 `/api/admin/update` 和旧订单状态路径
