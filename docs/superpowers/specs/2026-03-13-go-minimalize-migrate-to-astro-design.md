# Go 最小化 + 全面迁移 UI/BFF 到 Astro（Cloudflare）设计

> 目标：让 Cloudflare（Astro）成为唯一产品入口（页面 + BFF/代理 + 安全门禁），VPS 上的 Go 仅保留数据库与必需的业务数据面能力；并下线 Go 静态页面（/master.html、/admin.html、/:slug 静态 index.html 等）。

## 背景与现状

本仓库为双系统：

- `meituanGo/`：Go + Gin 后端（SQLite DB、MQTT、cron 等），当前仍暴露静态页入口。
- `meituanAstro/`：Astro + Preact 前端，Cloudflare Pages/Workers（`@astrojs/cloudflare`, `output: "server"`），提供同域 `/api/**` 路由作为 BFF/代理。

已落地的迁移先例：master 控制台已按 **proxy-only + HttpOnly cookie** 模式迁移到 Astro（通过同域 `/api/master/*`），并计划彻底下线旧的 `/master.html` 静态页。

当前 Go 仍存在的静态页与入口（证据）：
- `meituanGo/cmd/server/main.go:111-116`
  - `r.StaticFile("/admin.html", "./static/admin.html")`
  - `r.StaticFile("/master.html", "./static/master.html")`
  - `r.Static("/assets", "./static/assets")`
  - `r.StaticFile("/favicon.ico", "./static/favicon.ico")`
- `meituanGo/cmd/server/main.go:159-161`
  - `r.GET("/:slug", func(c *gin.Context) { c.File("./static/index.html") })`

## 设计目标（验收口径）

### 目标
1. **入口统一**：用户浏览器只访问 Cloudflare（Astro 域名），不直接访问 Go 域名。
2. **Go 最小化**：Go 只承担 DB + 必需业务 API（数据面），不再承担页面渲染/静态站点发布。
3. **安全门禁上移**：跨域、鉴权、CSRF/Origin 校验、输入校验等统一在 Astro `/api/**` 层实现（或至少先集中于该层）。

### 验收
- 线上 `https://api.serbia70.com/master.html` 返回 **404**。
- 线上 `https://api.serbia70.com/admin.html` 返回 **404**。
- 线上 `https://api.serbia70.com/<slug>` 不再直接返回 Go 的 `./static/index.html`（入口转移到 Astro）。
- 前端代码中不出现对 Go 真实域名的直连（只允许同域 `/api/**`）。

## 非目标（明确不做）

- 不在本 spec 中把 SQLite 从 VPS 搬到 Cloudflare（D1/R2 等）。
- 不在本 spec 中一次性迁移 MQTT/cron 到 Cloudflare（这将作为 Phase C 的单独设计与实施）。
- 不在本 spec 中重写业务模型，仅做“职责边界调整 + 入口收口”。

## 核心原则与硬规则

1. **Proxy-only**：浏览器端只调用同域 `/api/**`，由 Astro 侧路由转发/聚合至 Go。
2. **Go 不提供页面**：Go 上所有“面向用户的静态页面入口”必须移除（或显式 404）。
3. **Cookie 会话优先**：沿用已验证的 HttpOnly cookie 会话（尤其 master/admin），避免在浏览器暴露 server-only token。
4. **分期可上线**：每个 phase 的完成都必须可部署、可验证、可回滚。

## 目标架构

### 逻辑拓扑

- Browser → Cloudflare（Astro SSR + `/api/**` BFF）
- Cloudflare → VPS（Go API，仅数据面）

### 职责划分

#### `meituanAstro/`（Cloudflare）
- **UI**：shop/admin/master/rider 的所有页面与交互。
- **BFF（/api/**）**：
  - 鉴权：读取 cookie / header，按角色（master/admin/user/rider）执行一致的鉴权策略。
  - 安全门禁：Origin/Referer 校验（对状态变更请求）、限流/节流（如需要）、输入校验。
  - 代理与聚合：统一向 Go 发起请求，隐藏真实后端域名与细节。

#### `meituanGo/`（VPS）
- SQLite 数据面（读写 + migrations）。
- 业务 API（订单、预约、菜单、店铺、后台管理等）。
- MQTT 与 cron：**Phase A/B 先保留**，后续再评估迁移可行性。

## 分期迁移策略

### Phase A：入口收口（优先级最高）

**目标**：Go 彻底不再暴露静态页面入口；所有入口改由 Astro 提供。

- Go：移除/禁用静态页路由
  - `/master.html` 静态页 → 404
  - `/admin.html` 静态页 → 404
  - `/:slug` 返回 `./static/index.html` → 移除（由 Astro 对应路由提供页面）
  - `/assets`：按“唯一入口 CF”原则，逐步消除外部依赖；若短期仍被引用，需在 Astro 侧接管资产或提供迁移映射（不在本 phase 强制一次性完成）。

- Astro：确保入口可用
  - `/master` 已存在并可登录（现状）。
  - `/admin`、`/<slug>`（或项目现有等价路由）应由 Astro 页面承担，并通过 `/api/**` 调用后端。

**验收点**：
- `api.serbia70.com/master.html`、`api.serbia70.com/admin.html` 均为 404。
- 任意 `api.serbia70.com/<slug>` 不再直接返回 Go 静态页面。

### Phase B：页面职责清零 + 历史静态目录收敛

**目标**：`meituanGo/static/*` 不再承载任何生产必需页面，逐步清理历史包袱。

- 逐项确认是否仍有外部引用（二维码、历史链接、脚本硬编码等）。
- 必须保留的资产（如 favicon 或少量静态文件）应迁移到 Astro 公共资源目录并以 Cloudflare 域名对外提供。

### Phase C：后台任务与 I/O 重活的归宿（单独出 spec）

**范围候选**（不在本 spec 实施）：
- MQTT：是否可迁移/替换，或继续留在 VPS。
- cron：是否可迁移到 Cloudflare Cron Triggers（取决于是否需要本地 DB 强一致事务）。
- upload/backup/restore：是否改造为 R2（Go 仅签名/授权），或继续留 VPS 但入口统一从 Astro 发起。

## 安全性与运维考虑

- **最小暴露面**：Go 不对外提供 HTML 页面，显著降低“老页面携带旧逻辑/旧凭证策略”的风险。
- **统一鉴权口径**：鉴权与敏感操作门禁优先在 Astro `/api/**` 层统一实现；Go 侧继续做最终权限校验（双层防护）。
- **回滚策略**：
  - 若 Phase A 上线后发现某些老入口仍被外部依赖，可短期恢复单个路由（有审计/日志）并立即安排补齐 Astro 侧入口；避免长期回滚到“Go 继续出页面”的状态。

## 假设（因本轮不再追加澄清问题，显式锁定）

- 生产域名分工：Go 后端为 `https://api.serbia70.com/`；Astro/Cloudflare 为另一个对外域名（浏览器应只访问 CF）。
- 现有 master 迁移已经可用并以 cookie 作为登录态基础。
- 本阶段更重视“入口收口 + 安全暴露面收敛”，允许 UI 层逐步对齐（不要求一次性完美重做）。

## 交付物

- 一份实施计划（下一步由 writing-plans 生成），按 phase 拆分为可合并的小任务。
- 自动化门禁（测试/脚本）：
  - repo 内不允许出现硬编码 Go 公网域名（浏览器侧）。
  - Go 端不允许注册 `/master.html`、`/admin.html`、`/:slug -> static/index.html` 等静态入口。

