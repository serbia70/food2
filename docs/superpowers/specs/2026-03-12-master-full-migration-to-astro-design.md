# Master 控制台全量迁移到 Astro（替换 master.html）设计稿

日期：2026-03-12

## 背景与目标
当前 `meituanGo/static/master.html` 为单文件静态大页（内联 JS/CSS），使用 `localStorage.master_token`，直接调用 `/api/master/*`。该页面维护成本高、逻辑耦合强。

**目标（用户确认）**
- 方案：一次性全量迁移（B）
- 验收口径：功能一致即可（UI 可重做）（2）
- 线上请求路径：Cloudflare 上的 Astro 前端通过同域 `/api/master/*` 代理访问 Go 后端（A）
- 登录态：使用 Cookie（HttpOnly）保存 `master_token`
- 旧页面处理：彻底下线，不再暴露 `/master.html`（C）
- 功能范围：`master.html` 的全部 action/功能点 **全部保留**，不得删减（包括高危操作）

非目标
- 不重做后端 master action 协议；尽量保持 action 名称与 payload 结构兼容
- 不引入新的前端框架/状态管理库（以现有 Astro + 组件为主）

## 现状要点（代码证据）
- Go 静态路由：`meituanGo/cmd/server/main.go` 目前暴露 `r.StaticFile("/master.html", "./static/master.html")`
- 旧页接口调用：`meituanGo/static/master.html` 在脚本段调用：
  - `POST /api/master/login`
  - `GET /api/master/init`
  - `POST /api/master/manage`
  - `POST /api/master/restore`
  - `POST /api/master/backup`
  - `POST /api/master/upload`
- Astro 已具备 proxy/基础设施：
  - `meituanAstro/src/pages/api/master/*` 已覆盖：`init/login/logout/manage/backup/restore/upload/...`
  - `/master/login` 页面存在并可通过 `/api/master/login` 设置 `master_token` HttpOnly cookie
  - `/master` 页面存在，且已有多种 `components/master/*` 组件与 `lib/master-*` view helpers

## 方案选型
### 方案 A（推荐）：Astro 端组件化全量重写 UI，API 全走 `/api/master/*`
- 以 `/master` 为唯一入口，所有 tab、表单、弹窗在 Astro 组件中实现
- 仅复用现有接口协议（manage action 与独立 endpoint），不改业务语义

（用户已同意采用该推荐方案）

## 目标架构与模块边界
### 页面/路由
- `/master/login`：登录入口
- `/master`：控制台入口（唯一）
- `/api/master/*`：同域代理层（Cloudflare 环境下转发至 Go `https://api.serbia70.com/`）

### 前端边界划分（建议）
1. `meituanAstro/src/pages/api/master/*`：只做鉴权解析（cookie → Authorization）+ 转发，不做业务逻辑。
2. `meituanAstro/src/lib/master-*`：纯函数与 view model（格式化、校验、映射），可单测。
3. `meituanAstro/src/components/master/*`：tab 组件、card/panel、弹窗/表单组件。
4. （新增）`meituanAstro/src/lib/master-client.ts`：对 `/api/master/*` 的调用封装（typed manage action），作为页面唯一数据访问层。

### 关键兼容点
- `manage` 仍为多 action 入口：保持 action 名称、payload 与返回结构兼容。
- `backup/restore/upload` 保持独立 endpoint。

## 信息架构（Tab 设计）
采用 query tab（兼容现有实现），例如 `/master?tab=shops`。

建议 tab 分组：
- `overview`：总览（全局统计 + 店铺摘要）
- `shops`：店铺管理（创建、编辑、删除、套餐、余额、重置密码等）
- `renew`：续费审批（approve/reject）
- `settings`：全局设置（update_settings）
- `categories`：类目设置（update_categories）
- `pricing`：价格/提成/外卖规则（update_rate_center 等）
- `billing`：账单/余额（get_shop_billing）
- `backup`：备份/恢复（backup/restore/trigger_backup）
- `security`：密码修改（update_password）
- `commission`：批量提成（batch_update_commission）

## 功能清单（必须 100% 覆盖）
### 直接调用接口
- `POST /api/master/login`
- `GET /api/master/init`
- `POST /api/master/manage`
- `POST /api/master/backup`
- `POST /api/master/restore`
- `POST /api/master/upload`

### manage action（来自旧页）
- `update_settings`
- `update_categories`
- `update_rate_center`
- `get_shop_billing`
- `adjust_shop_balance`
- `update_shop`
- `set_shop_plan`
- `create_shop`
- `delete_shop`
- `update_password`
- `trigger_backup`
- `batch_update_commission`
- `approve_renew`
- `reject_renew`

## 数据流与状态策略
- 核心数据源：`GET /api/master/init`
- SSR 首屏：在 `/master` 服务器端获取 init 并渲染首屏；缺 cookie 则 302 `/master/login`
- 客户端刷新：提供“刷新数据”按钮，重新请求 init
- 写操作后刷新：任意 action 成功后默认刷新一次 init，确保一致性（降低前端 patch 风险）

## 认证 / 401 / 退出
- token：只用 HttpOnly cookie `master_token`
- API 代理：`resolveMasterAuth(... allowFallbackToken:false)`，避免 fallback token 后门
- 401：统一 UI 引导“去登录”，并提供“退出”（调用 `/api/master/logout` 清 cookie）

## 高危动作防误触规则（不删功能）
高危动作（至少）：`delete_shop`、`restore`、`trigger_backup`，以及批量/大额变更。

统一交互规则：
1. 二次确认弹窗：展示 action + 关键参数
2. 输入确认词：如 `DELETE`/`RESTORE` 或店铺 slug
3. （可选）冷却倒计时 2-3 秒
4. 成功回显摘要；失败展示后端 error 原文

## 错误处理
- action 失败：展示 action 名、payload 摘要（隐藏敏感字段）、后端 error
- 保持弹窗内容不丢失，便于截图定位

## 验收清单
1. 登录/退出：cookie 设置与清理正确；/master 未登录跳 /master/login
2. init：总览与店铺列表渲染正常
3. manage actions：上述全部 action 均可触发且结果可见
4. 独立接口：backup list/create/delete；restore；upload
5. 401/错误态：不会白屏，有明确 CTA
6. 下线旧页：Go 不再暴露 `/master.html`

## 风险与约束
- 一次性下线旧页意味着必须保障功能覆盖与回归验证；建议上线前至少进行一轮“逐项点检”
- 高危动作必须具备强二次确认，避免误删/误恢复

---

## 结论
采用“方案 A：Astro 组件化全量重写”，沿用现有 `/api/master/*` 代理与 cookie 登录态，保持后端 action 协议不变；迁移完成后下线 `/master.html`。
