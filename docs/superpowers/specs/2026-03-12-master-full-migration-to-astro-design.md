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
- `/api/master/*`：同域代理层（Cloudflare 环境下转发至 Go 后端；后端 base URL 通过环境变量配置，禁止硬编码）

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

### 口径：以旧页为唯一真相（Source of Truth）
本迁移的“100% 覆盖”必须可验证，不能靠记忆/感觉。

**真相来源**
- `meituanGo/static/master.html`（以及其引用的任何静态脚本/资源，如未来存在）

**强制步骤（作为上线门禁）**
- 从旧页中提取：
  - 所有调用的 endpoint（method + path）
  - 所有 `manage.action` 值
  - 每个 action 的最小必填字段（从旧页构造 payload 的代码推断）
- 将提取结果填入本节的“功能清单表”，并在实现验收时逐项勾选。

**上线门禁（不可跳过）**
- Action 覆盖勾检表中若仍存在任何 `TBD(...)`，视为规格未完成：不得进入实现/上线验收阶段。
- 每个 action/endpoint 必须补充“旧页证据”（代码行号或片段），便于复核。

> 备注：本设计稿当前先列出已识别的 action/endpoint，最终以提取结果为准，若发现漏项必须补齐。

### 直接调用接口（已识别）
- `POST /api/master/login`
- `POST /api/master/logout`
- `GET /api/master/init`
- `POST /api/master/manage`
- `POST /api/master/backup`
- `POST /api/master/restore`
- `POST /api/master/upload`

### manage action（已识别）
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

### Action 覆盖勾检表（上线前必须全绿）
| action / endpoint | 类型 | 高危 | 旧页入口（按钮/区域） | 旧页证据（行号/片段） | 最小 payload 字段 | 预期结果/回显 | 已迁移 | 已手工验收 |
|---|---|---|---|---|---|---|---|---|
| POST /api/master/login | endpoint | 否 | 登录弹窗（“进入系统”） | `meituanGo/static/master.html:573-574,1750-1760` | `username`,`password` | 返回 token（旧页写入 `localStorage.master_token`；新实现改为 HttpOnly cookie） | ☐ | ☐ |
| POST /api/master/logout | endpoint | 否 | 顶部“退出”按钮 | 旧页**未调用**该接口：仅 `localStorage.removeItem("master_token")`（`master.html:598,1778-1782`）；Astro 已有 `/api/master/logout`：`meituanAstro/src/pages/api/master/logout.ts:5-11` | - | 清理 `master_token` cookie，返回 `{ success: true }` | ☐ | ☐ |
| GET /api/master/init | endpoint | 否 | 首屏加载（本地有 token 即 init） | `master.html:1742-1748,1784-1807` | - | 返回 `shops/settings` 等（旧页用于渲染店铺与设置） | ☐ | ☐ |
| POST /api/master/manage (action=update_settings) | action | 否 | “系统设置”Tab → “💾 保存所有设置” | UI：`master.html:789-790,1461-1463`；请求：`master.html:2317-2376` | `mqttBroker`,`footerText`,`footerPhone`,`footerCopyright`,`subscriptionDeliveryCommissionType`,`subscriptionDeliveryCommissionValue`,`businessDeliveryCommissionType`,`businessDeliveryCommissionValue`,`subscriptionFeeRsd`,`businessFeeRsd`,`billingCurrency`,`graceDays`,`retentionDineInDays`,`retentionDeliveryDays`,`statsRetentionMode`,`wechatId`,`wechat_contact_qr`,`alipay_payment_qr`,`wechat_payment_qr`,`exchange_rate`,`imageStorage`,`r2PublicDomain`,`uploadStrictR2`,`backupTime`,`backupRetention`,`backupTarget`,`backupHost`,`backupUser`,`backupPass`,`backupPath`,`backupEndpoint`,`backupBucket` | 保存成功并提示（旧页 `alert("✅ 设置已保存")`） | ☐ | ☐ |
| POST /api/master/manage (action=update_categories) | action | 否 | “系统设置”Tab → “保存分类配置” | UI：`master.html:791-823`；请求：`master.html:2379-2387` | `payload`（JSON 数组；旧页 `JSON.parse(textarea)` 后直接透传） | 保存成功并提示（旧页 `alert("✅ 分类已更新")`） | ☐ | ☐ |
| POST /api/master/manage (action=update_rate_center) | action | 否 | “系统设置”Tab → “💾 保存汇率配置” | UI：`master.html:1051-1152`；请求：`master.html:2403-2411` | `base_rate`,`manual_offset`,`daily_step` | 保存成功并提示（旧页 `alert("✅ 汇率已保存")`） | ☐ | ☐ |
| POST /api/master/manage (action=get_shop_billing) | action | 否 | 店铺列表 → “编辑(✏️)”打开弹窗后自动加载余额 | UI：`master.html:2017-2022,2584-2587`；请求：`master.html:2470-2490` | `id` | 返回账单数据并回显到“当前余额”（旧页更新 `#edit-billing-balance`） | ☐ | ☐ |
| POST /api/master/manage (action=adjust_shop_balance) | action | 是 | 店铺编辑弹窗 → “💰 钱包充值”面板 → “充值”按钮 | UI：`master.html:1620-1701`；请求：`master.html:2503-2550` | RSD 充值：`id`,`amountRsd`,`entryType`,`note`；CNY 充值：`id`,`sourceCurrency`,`sourceAmount`,`entryType`,`note` | 余额变更并回显（旧页更新余额、清空输入并 `alert("✅ 充值成功")`） | ☐ | ☐ |
| POST /api/master/manage (action=update_shop) | action | 否 | 店铺编辑弹窗 → “💾 保存” | UI：`master.html:1466-1475,1724-1726`；请求：`master.html:2589-2622` | `id`,`name`,`slug`,`expireDate`,`lastPaidMonth`,`commissionMode`,`commissionType`,`commissionValue`,`enableDelivery`,`enableDineIn`,`enableReservation`,`newPassword` | 更新成功后提示并 `location.reload()` | ☐ | ☐ |
| POST /api/master/manage (action=set_shop_plan) | action | 否 | 店铺编辑弹窗保存时顺带设置套餐（非独立按钮） | 请求：`master.html:2614-2617` | `id`,`planType` | 更新套餐成功后继续完成保存流程（失败则中断） | ☐ | ☐ |
| POST /api/master/manage (action=create_shop) | action | 否 | “创建店铺”Tab → “✨ 创建店铺” | UI：`master.html:751-785`；请求：`master.html:2624-2637` | `name`,`phone`,`password` | 创建成功提示并刷新（旧页 `alert("✅ 创建成功: " + res.slug)` + reload） | ☐ | ☐ |
| POST /api/master/manage (action=delete_shop) | action | 是 | 店铺列表 → 删除按钮（🗑️） | UI：`master.html:2140-2169`；请求：`master.html:2640-2646` | `ID` | 删除成功后刷新（旧页 `location.reload()`） | ☐ | ☐ |
| POST /api/master/manage (action=update_password) | action | 是 | “系统设置”Tab → “🔑 修改超级密码” → “💾 保存” | UI：`master.html:1212-1225`；请求：`master.html:2649-2661` | `newPassword` | 成功提示并强制重新登录（旧页清 token + reload） | ☐ | ☐ |
| POST /api/master/manage (action=trigger_backup) | action | 是 | “📦 数据备份与还原” → “⚡ 立即备份并下载 (本地)” | UI：`master.html:1228-1250`；请求：`master.html:2664-2674` | （空对象） | 触发成功并回显 message（旧页 `alert(result.message)`） | ☐ | ☐ |
| POST /api/master/manage (action=batch_update_commission) | action | 是（批量） | 店铺管理 Tab → “🚀 执行批量替换” | UI：`master.html:643-688`；请求：`master.html:2709-2723` | `oldVal`,`newVal`,`type` | 批量更新并提示变更数量（旧页 `alert(...)` + reload） | ☐ | ☐ |
| POST /api/master/manage (action=approve_renew) | action | 否 | “待办审核”Tab → “✅ 确认” | UI：`master.html:741-748,1890-1954`；请求：`master.html:2726-2735` | `ID` | 审批成功提示并刷新 | ☐ | ☐ |
| POST /api/master/manage (action=reject_renew) | action | 否 | “待办审核”Tab → “❌ 驳回” | UI：`master.html:741-748,1890-1954`；请求：`master.html:2738-2745` | `ID` | 驳回成功并刷新 | ☐ | ☐ |
| POST /api/master/backup | endpoint | 是 | “系统设置”Tab → Code Backup 区域（加载/创建/删除） | 列表：`master.html:2748-2801`；创建：`master.html:2804-2833`；删除：`master.html:2836-2846` | JSON：list：`action`；create/delete：`action`,`backupName`（create 时来自输入框；delete 时来自列表项 name） | 列表刷新/创建后可见/删除后不可见 | ☐ | ☐ |
| POST /api/master/restore | endpoint | 是 | “📦 数据备份与还原” → “🚀 开始还原”（选择 .zip 文件） | UI：`master.html:1261-1277`；请求：`master.html:2676-2706` | `multipart/form-data`：`file`（zip 文件） | 恢复并强提示风险；成功后提示并刷新 | ☐ | ☐ |
| POST /api/master/upload | endpoint | 否 | “系统设置”Tab → 各种“上传”按钮（二维码/收款码） | UI：`master.html:1033-1046,1162-1192`；请求：`master.html:2849-2893` | `multipart/form-data`：`file`（image/*） | 返回 `{ success, url }` 并回填到目标 input（旧页 `#<targetId>.value = data.url`） | ☐ | ☐ |

## 数据流与状态策略
- 核心数据源：`GET /api/master/init`

### SSR 与代理路径（必须明确且一致）
为了满足“线上请求必须走同域 `/api/master/*` 代理”的约束：
- `/master` 的 SSR 获取 init 时，应优先请求 **同域** `GET /api/master/init`（而非直连 Go）。
- 代理层从 cookie 解析 `master_token` 并注入 `Authorization` 转发到 Go。

这样保证：
- 浏览器与 SSR 都走同一条代理链路
- Cloudflare 环境下不会因为跨域/直连策略导致行为不一致

### 刷新策略
- SSR 首屏：在 `/master` 服务器端获取 init 并渲染首屏；缺 cookie 则 302 `/master/login`
- 客户端刷新：提供“刷新数据”按钮，重新请求 init
- 写操作后刷新：任意 action 成功后默认刷新一次 init，确保一致性（降低前端 patch 风险）

## 认证 / 401 / 退出
- token：只用 HttpOnly cookie `master_token`（可选增强：使用 `__Host-master_token` 以强化约束）
- cookie 属性要求（按环境）：
  - 生产环境（https）：
    - `HttpOnly: true`
    - `Secure: true`
    - `SameSite: Lax`（允许站内跳转场景；如后续无第三方嵌入需求，可升级为 Strict）
    - `Path: /`
    - `Max-Age`: 12h（或与后端 token 过期策略一致）
  - 本地开发（http）：允许 `Secure: false`（否则 cookie 无法写入，登录会失败）
- API 代理：`resolveMasterAuth(... allowFallbackToken:false)`，避免 fallback token 后门
- CSRF posture（最小可行且不破坏 SSR）
  - 适用范围：仅对同域 `/api/master/*` 的**状态变更**请求（POST/PUT/PATCH/DELETE）生效；`GET /api/master/init` 不做 CSRF 校验。
  - 校验规则（确定性算法）：
    1) 如果请求包含 `Origin`：必须等于当前站点 `origin`，否则 **403**。
    2) 否则如果请求包含 `Referer`：其 `origin` 必须等于当前站点 `origin`，否则 **403**。
    3) 否则（两者都缺失）：**放行**（用于 SSR / 非浏览器工具调用），但必须仍通过 cookie 鉴权（HttpOnly `master_token`）与后端权限校验。
  - 说明：我们优先“同源校验有头就严格、没头不误杀 SSR”，后续如需更强 CSRF 可再评估双重提交 token 等方案。
- 401：统一 UI 引导“去登录”，并提供“退出”（调用 `/api/master/logout` 清 cookie）
- 退出/清理 cookie（必须一致）：`/api/master/logout` 必须通过 `Set-Cookie` 清除 cookie，要求：
  - cookie 名称与登录一致
  - `Path=/`（与登录保持一致）
  - `Max-Age=0`（或 `Expires` 设为过去时间）
  - `HttpOnly/SameSite/Secure` 属性与登录时保持一致（避免出现“同名不同属性 cookie”残留）

## 高危动作防误触规则（不删功能）
高危动作（至少）：`delete_shop`、`restore`、`trigger_backup`、`batch_update_commission`、`adjust_shop_balance`（充值/扣款一律按高危处理，不设金额阈值）。

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
3. manage actions：Action 覆盖勾检表中全部 action 均可触发且结果可见
4. 独立接口：backup(list/create/delete)、restore、upload 均可用且有回显
5. 401/错误态：不会白屏，有明确 CTA
6. 下线旧页：Go 不再暴露 `/master.html`

## 旧页下线与切换策略
- 最终状态：Go 侧不再 `StaticFile("/master.html", ...)`，访问 `/master.html` 应返回 **404**。
- 安全要求：如果 Go 后端对公网可直达，则必须同样不提供旧页（避免绕过新 UI 的安全/确认策略）。

## 风险与约束
- 一次性下线旧页意味着必须保障功能覆盖与回归验证；建议上线前至少进行一轮“逐项点检”
- 高危动作必须具备强二次确认，避免误删/误恢复

---

## 结论
采用“方案 A：Astro 组件化全量重写”，沿用现有 `/api/master/*` 代理与 cookie 登录态，保持后端 action 协议不变；迁移完成后下线 `/master.html`。
