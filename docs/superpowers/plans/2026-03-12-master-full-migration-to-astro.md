# Master Full Migration to Astro Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 master 全量迁移到 Astro 时的阶段性步骤，文中的 `历史红灯预期：`、旧路径与 parity 清单属于当时的推进语境，不应再直接当作当前仓库基线。
> 若继续处理 master 迁移或代理边界，请先以当前 `src/pages/master/**`、`src/pages/api/master/**` 与最新设计文档为准。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `meituanAstro` 的 `/master` 控制台 100% 替换 `meituanGo/static/master.html`，功能点与 action 完全覆盖；生产环境请求全部走同域 `/api/master/*` 代理；登录态使用 HttpOnly cookie；并在 Go 侧下线 `/master.html`（404）。

**Architecture:** Astro 提供 UI（tab + 组件化表单/弹窗）；同域 `meituanAstro/src/pages/api/master/*` 作为代理层，从 cookie 解析 `master_token` 注入 `Authorization` 转发到 Go `/api/master/*`；页面 SSR 与浏览器端都通过代理访问数据，避免直连 Go 与跨域差异。

**Tech Stack:** Astro + TypeScript（meituanAstro，pnpm），Go + Gin（meituanGo），node:test（前端单测）。

---

## File structure map（将改哪些文件，负责什么）

### Frontend (Astro)
- Modify: `meituanAstro/src/pages/master/index.astro`
  - `/master` 的唯一入口；SSR 获取 init（必须走同域 `/api/master/init`）；tab/布局壳层；401/错误态统一呈现。
- Modify: `meituanAstro/src/pages/master/login/index.astro`
  - 登录页；成功后进入 `/master`；必要时补充返回路径体验。
- Create: `meituanAstro/src/lib/master-client.ts`
  - 唯一数据访问层：封装对 `/api/master/*` 的调用（`init/manage/backup/restore/upload/logout`）。
- Create/Modify: `meituanAstro/src/components/master/*`
  - 每个 tab 的组件、表单、弹窗、高危二次确认组件（可复用一个 ConfirmModal）。
- Modify: `meituanAstro/src/pages/api/master/*.ts`
  - 代理层：必要时补齐 CSRF 校验规则、logout 清 cookie 的一致性等。
- Test (create/modify): `meituanAstro/src/lib/master-client.test.ts`
  - 验证客户端封装：endpoint、method、body 形状、错误处理分支。

### Backend (Go)
- Modify: `meituanGo/cmd/server/main.go`
  - 移除 `r.StaticFile("/master.html", "./static/master.html")`，使 `/master.html` 返回 404。
- (Optional) Delete: `meituanGo/static/master.html`
  - 仅在确认不再需要后删除（最终目标是彻底不用）。

### Spec / gates
- Modify: `docs/superpowers/specs/2026-03-12-master-full-migration-to-astro-design.md`
  - 填完所有 `TBD` 字段与旧页证据行号，作为上线门禁。

---

## ## Chunk 1: 规格门禁（Parity 清单补全）

### Task 1: 从旧 master.html 提取真相并补全勾检表（必须先做）

**Files:**
- Modify: `docs/superpowers/specs/2026-03-12-master-full-migration-to-astro-design.md`
- Read-only: `meituanGo/static/master.html`

- [ ] **Step 1: 从旧页提取 endpoint + manage.action + payload 字段**
  - 做法：逐段阅读 `master.html` 的 `<script>`，定位每个 `fetch("/api/master/...`) 与 `fetchAPI({ action: ... payload })` 的 payload 构造。
  - 输出：把每个 action 的必填字段写进表格“最小 payload 字段”，并在“旧页证据”列填上 `master.html:<line>`。

- [ ] **Step 2: 把表格中的所有 `TBD(...)` 清零**
  - Expected: spec 中 Action 覆盖表不再出现 `TBD`。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-03-12-master-full-migration-to-astro-design.md
git commit -m "docs(master): fill parity checklist payloads"
```

---

## ## Chunk 2: 代理与鉴权闭环（proxy-only + cookie）

### Task 2: 确保 `/master` SSR 与浏览器都走同域 `/api/master/*`

- [ ] **Step 0: Proxy-only 审计（必须）**
  - 在改代码前先全局搜索，确保 master 相关实现不会直连 Go 后端 `/api/master/*`（不得使用 `${API_BASE_URL}/api/master/*` 或硬编码 URL）。
  - 目标：所有 master 请求一律是相对路径 `/api/master/*`。

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

- [ ] **Step 1: 写一个最小的断言用例（可选但推荐）**
  - 目标：防止未来回归到“SSR 直连 Go”。
  - 方式：在 `meituanAstro/src/lib/master-client.test.ts` 里模拟 server 环境，断言 init 请求路径是 `/api/master/init`。

- [ ] **Step 2: 修改 `/master` 的 SSR init 获取路径（并显式转发 cookie）**
  - 将当前 SSR 侧对 `${API_BASE_URL}/api/master/init` 的调用改为同域 `/api/master/init`。
  - **重要：SSR 发起的 fetch 必须转发当前请求的 cookie**（从 `Astro.request.headers.get('cookie')` 取值，并设置到 fetch headers 里），否则代理层读不到 HttpOnly cookie，会导致 SSR 401。
  - Expected:
    - 已登录状态下硬刷新 `/master` 仍能 SSR 出首屏，不出现 401/跳转闪烁。

- [ ] **Step 3: Commit**

```bash
git add meituanAstro/src/pages/master/index.astro
# 如有新增测试文件也一并 add
# git add meituanAstro/src/lib/master-client.test.ts

git commit -m "fix(master): fetch init through same-origin proxy"
```

### Task 3: 退出/logout 与 cookie 清理一致性

> 注：如果此时 `master-client.ts` 还未引入，可以先直接 `fetch('/api/master/logout')`；但在 Task 4 完成后，建议统一改为 `client.logout()`，保持“唯一数据访问层”的边界。

**Files:**
- Verify/Modify: `meituanAstro/src/pages/api/master/logout.ts`
- Modify: `meituanAstro/src/pages/master/index.astro`（增加退出入口/401 CTA）

- [ ] **Step 1: 为 logout 行为补一条最小测试（如已有测试框架则加；否则手工验证写入计划记录）**
  - 目标：调用 `/api/master/logout` 后 cookie 被清除，访问 `/master` 302 到 `/master/login`。

- [ ] **Step 2: 在 `/master` 顶部加入“退出”操作**
  - 行为：`await fetch('/api/master/logout', { method: 'POST' })` 后跳转 `/master/login`。

- [ ] **Step 3: Commit**

```bash
git add meituanAstro/src/pages/api/master/logout.ts meituanAstro/src/pages/master/index.astro
git commit -m "feat(master): add logout action and 401 CTA"
```

---

## ## Chunk 3: masterClient（唯一数据访问层）+ 单测

### Task 4: 新增 `master-client.ts` 并用测试锁定请求契约

**Files:**
- Create: `meituanAstro/src/lib/master-client.ts`
- Create: `meituanAstro/src/lib/master-client.test.ts`

- [ ] **Step 1: 写 failing test（先写测试再写实现）**
  - 覆盖：
    - `init()` -> GET `/api/master/init`
    - `manage(action, payload)` -> POST `/api/master/manage`，JSON body 包含 `action`
    - `backupList/create/delete` -> POST `/api/master/backup`，body action 正确
    - `restore`/`upload` -> 透传旧页真实请求体：优先支持 `FormData`（multipart，**不要手动设置 Content-Type** 让浏览器带 boundary），若旧页为 JSON 则同样兼容

示例（node:test 伪代码，按项目现状落地）：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterClient } from './master-client';

test('init uses same-origin proxy', async () => {
  const calls: any[] = [];
  const client = createMasterClient({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ shops: [], settings: {} }), { status: 200 });
    },
  });

  await client.init();
  assert.equal(calls[0].url, '/api/master/init');
  assert.equal(calls[0].init?.method, 'GET');
});
```

- [ ] **Step 2: 运行测试确保失败**

Run (from `meituanAstro/`):
```bash
node --test src/lib/master-client.test.ts
```
历史红灯预期：（因为还未实现）。

- [ ] **Step 3: 写最小实现让测试通过**
  - `createMasterClient({ fetch })` 注入 fetch，便于测试。
  - 所有 JSON 请求统一 `Content-Type: application/json`。

- [ ] **Step 4: 再跑测试确保通过**

```bash
node --test src/lib/master-client.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add meituanAstro/src/lib/master-client.ts meituanAstro/src/lib/master-client.test.ts
git commit -m "feat(master): add master client wrapper"
```

---

## ## Chunk 4: UI 结构（tab 壳层 + 复用组件）

### Task 5: 统一 tab 路由与默认行为

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/lib/master-active-tab.ts`（如需要）

- [ ] **Step 1: 设定默认 tab**
  - 缺省 `tab` -> `overview`。

- [ ] **Step 2: 未知 tab 回退**
  - 任何非法值 -> `overview`（并可选地更新 URL）。

- [ ] **Step 3: Commit**

```bash
git add meituanAstro/src/pages/master/index.astro meituanAstro/src/lib/master-active-tab.ts
git commit -m "feat(master): normalize tabs and defaults"
```

### Task 6: 高危确认弹窗组件（可复用）

**Files:**
- Create: `meituanAstro/src/components/master/MasterDangerConfirm.astro`（或同名 TSX/astro）

- [ ] **Step 1: 先写最小 UI（不接业务）**
  - 输入确认词、倒计时（可选）、确认按钮禁用逻辑。

- [ ] **Step 2: 在至少一个高危 action 上接入（例如 delete_shop）**

- [ ] **Step 3: Commit**

```bash
git add meituanAstro/src/components/master/MasterDangerConfirm.astro
git commit -m "feat(master): add reusable danger confirm modal"
```

---

## ## Chunk 5: 功能全量覆盖（按 action 分组逐个完成 + 每步回归）

> 规则：每完成一组 action，必须：
> 1) 刷新 init 验证 UI 状态更新
> 2) 在 spec 的勾检表中把“已迁移/已手工验收”勾上（并写备注）
> 3) 小步 commit

### Task 7: Settings / Categories / Rate Center

**Files:**
- Modify: `meituanAstro/src/components/master/Master*SettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`（注入 masterClient / 处理成功刷新）

- [ ] **Step 1: 为每个保存按钮统一走 `client.manage(action, payload)`**
- [ ] **Step 2: 成功后刷新 init + 给出成功提示**
- [ ] **Step 3: 失败展示后端 error**
- [ ] **Step 4: Commit**

```bash
git add meituanAstro/src/components/master/*.astro meituanAstro/src/pages/master/index.astro
git commit -m "feat(master): wire settings actions through manage"
```

### Task 8: Shops 全套（create/update/delete/set_shop_plan/reset password/topup）

**Files:**
- Modify: `meituanAstro/src/components/master/MasterCreateShopCard.astro`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/components/master/MasterShopEditPanel.astro`
- Modify: `meituanAstro/src/components/master/MasterShopTopupPanel.astro`

- [ ] **Step 1: create_shop**（创建成功后刷新 init）
- [ ] **Step 2: update_shop**（编辑保存后刷新 init）
- [ ] **Step 3: set_shop_plan**（套餐修改后刷新 init）
- [ ] **Step 4: adjust_shop_balance**（高危确认 + 成功后刷新 init）
- [ ] **Step 5: delete_shop**（高危确认：输入 slug/DELETE + 冷却可选）
- [ ] **Step 6: Commit（可按每 1-2 个 action 一个 commit）**

示例：
```bash
git add meituanAstro/src/components/master/*.astro
git commit -m "feat(master): implement shop create and edit flows"
```

### Task 9: Renew 审批（approve/reject）

**Files:**
- Modify: 相关 master 组件（若现有 Renew UI 组件不存在，则创建 `MasterRenewPanel.astro`）

- [ ] **Step 1: 展示 pending 列表（来自 init 数据）**
- [ ] **Step 2: approve_renew / reject_renew 调用 manage**
- [ ] **Step 3: 成功后刷新 init**
- [ ] **Step 4: Commit**

### Task 10: Billing（get_shop_billing）

**Files:**
- Create/Modify: `meituanAstro/src/components/master/MasterBillingPanel.astro`

- [ ] **Step 1: 选择店铺 + 调用 `manage(get_shop_billing)`**
- [ ] **Step 2: 展示返回数据（表格/列表）**
- [ ] **Step 3: Commit**

### Task 11: Backup / Restore / Upload / Trigger backup

**Files:**
- Verify/Modify: `meituanAstro/src/pages/api/master/restore.ts`
- Verify/Modify: `meituanAstro/src/pages/api/master/upload.ts`
- Modify: `meituanAstro/src/components/master/MasterCodeBackupCard.astro`
- Modify: `meituanAstro/src/components/master/MasterDataBackupCard.astro`
- Modify/Create: `meituanAstro/src/components/master/MasterRestorePanel.astro`
- Modify/Create: `meituanAstro/src/components/master/MasterUploadPanel.astro`

- [ ] **Step 0: 验证 restore/upload 代理具备 multipart 透传能力（必须先做）**
  - 要求：不得在 proxy route 中调用 `request.json()` 之类破坏 multipart 的解析；必须把请求体原样转发给 Go。
  - 校验点：`Content-Type: multipart/form-data; boundary=...` 必须能被 Go 收到；不要手动重写 boundary。

- [ ] **Step 1: backup list/create/delete**（走 `/api/master/backup`，并刷新列表）
- [ ] **Step 2: trigger_backup**（走 manage，高危确认）
- [ ] **Step 3: restore**（走 `/api/master/restore`，高危确认：RESTORE + backupName）
- [ ] **Step 4: upload**（走 `/api/master/upload`，展示结果）
- [ ] **Step 5: Commit**

### Task 12: Security / Password（update_password）

**Files:**
- Modify/Create: `meituanAstro/src/components/master/MasterPasswordPanel.astro`

- [ ] **Step 1: 从 spec 勾检表补全 update_password 的 payload 字段**
- [ ] **Step 2: 表单 + 高危确认（例如输入 CHANGE）**
- [ ] **Step 3: 调用 `client.manage('update_password', payload)`**
- [ ] **Step 4: 成功后强制退出**
  - `await client.logout()` -> 跳转 `/master/login`
- [ ] **Step 5: Commit**

```bash
git add meituanAstro/src/components/master/MasterPasswordPanel.astro
git commit -m "feat(master): implement update_password flow"
```

### Task 13: Commission batch（batch_update_commission）

**Files:**
- Create/Modify: `meituanAstro/src/components/master/MasterCommissionBatchPanel.astro`

- [ ] **Step 1: 表单 + 高危确认（批量）**
- [ ] **Step 2: manage 调用 + 成功后刷新 init**
- [ ] **Step 3: Commit**

---

## ## Chunk 6: 下线旧 `/master.html`（Go）

### Task 14: Go 侧移除静态 master.html 路由

**Files:**
- Modify: `meituanGo/cmd/server/main.go`

- [ ] **Step 1: 移除 `r.StaticFile("/master.html", "./static/master.html")`**
- [ ] **Step 2: 本地启动 Go（如你有流程）或用最小方式验证 `/master.html` 404**
- [ ] **Step 3: Run Go tests**

```bash
cd meituanGo
go test ./...
```
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add meituanGo/cmd/server/main.go
git commit -m "fix(go): stop serving legacy master.html"
```

---

## ## Chunk 7: 全量验证（证据优先）

### Task 15: 前端测试 + 构建 + 手工点检

**Files:**
- Modify (optional): `docs/superpowers/specs/2026-03-12-master-full-migration-to-astro-design.md`（勾选验收与记录）

- [ ] **Step 0: 安装依赖（如尚未安装）**

```bash
cd meituanAstro
pnpm install
```

- [ ] **Step 1: 运行前端单测**

```bash
cd meituanAstro
node --test src/lib/master-client.test.ts
```
Expected: PASS。

- [ ] **Step 2: 构建**

```bash
cd meituanAstro
pnpm build
```
Expected: PASS。

- [ ] **Step 3: 手工点检（按 spec 勾检表逐项）**
  - 登录/退出
  - init 加载
  - 每个 manage action 都走一遍（尤其是高危）
  - backup/restore/upload
  - 401 场景

- [ ] **Step 4: 把勾检表补全并提交**

```bash
git add docs/superpowers/specs/2026-03-12-master-full-migration-to-astro-design.md
git commit -m "docs(master): mark parity checklist as verified"
```

---

# Plan review loop
- 完成每个 chunk 后，建议用 code-reviewer/plan-review 子代理审阅本计划对应 chunk 的可执行性与遗漏点。

# Execution handoff
Plan complete and saved to `docs/superpowers/plans/2026-03-12-master-full-migration-to-astro.md`. Ready to execute?
