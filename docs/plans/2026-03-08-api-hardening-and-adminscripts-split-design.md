# API Hardening And AdminScripts Split Design

## 背景

当前项目已经完成了一轮前端高风险注入面清理，但仍存在两个结构性问题：

1. `src/pages/api/**` 的请求校验、错误结构、代理超时处理仍然不统一，导致接口入口质量不稳定。
2. `src/components/admin/AdminScripts.astro` 体量过大，承担了实时通信、预约、菜单、配送、设置、统计、订单编辑、导入导出等多类职责，维护与回归成本过高。

这两个问题是相互耦合的：如果先拆前端脚本而不先统一 API 基础层，拆出来的模块会复制不一致的 fetch、错误处理、参数校验；如果只做 API 收口而不拆脚本，后台迭代仍然会持续痛苦。

## 目标

本轮工作同时完成两件事：

1. 建立可复用的 API 校验与响应基础层，让高频接口逐步统一到一致模式。
2. 将 `AdminScripts.astro` 从“大一统脚本”拆成按业务域组织的多个模块，最终只保留装配层。

## 设计原则

- 先打基础，再拆分：先做 API 收口骨架，再拆 `AdminScripts`。
- 增量演进，不一次推翻：优先处理高频接口与耦合较低的 admin 模块。
- 统一成功/失败输出：避免前端出现大量 `data.success`、`data.error`、`res.ok` 混杂分支。
- DOM 与安全 helper 复用：拆分后的 admin 模块共享通用 helper，不再各写一套。
- 单个模块可独立回归：每拆一个业务域，都能单独验证，不影响其余区域。

## 推荐方案

采用“方案 B”：先做 API 层统一收口骨架，再按业务域拆 `AdminScripts.astro`。

原因：

- 风险最低，不会在拆分过程中扩散旧问题。
- 拆出来的模块天然复用新的 API 与错误处理约定。
- 后续新增后台功能时，不需要再回到 2000+ 行文件里修改。

## 架构设计

### 一、API 基础层

建议新增或重组基础能力到 `src/lib/api/`（或等价目录），形成以下职责：

- `parseJsonBody(request, schema)`：统一解析 JSON body，并返回校验结果。
- `parseQuery(url, schema)`：统一解析 query。
- `jsonOk(data, status?)`：统一成功响应。
- `jsonError(message, status, extra?)`：统一失败响应。
- `proxyJson(...)` / `proxyText(...)`：统一上游转发与超时处理。
- `requireAdminAuth(...)` / `requireMasterAuth(...)`：逐步把鉴权入口也收口。

现有文件关系：

- `src/lib/validation.ts`：保留 schema 定义，扩展 helper。
- `src/lib/api-proxy.ts`：升级为更通用的代理基础层。
- `src/lib/master-auth.ts`：保留 master 认证能力，但后续纳入统一 API 辅助目录。

### 二、首批 API 接入范围

优先接入这几类高频接口：

- `src/pages/api/order.ts`
- `src/pages/api/reservation.ts`
- `src/pages/api/user/address.ts`
- `src/pages/api/admin/stats.ts`
- `src/pages/api/admin/reservations.ts`
- `src/pages/api/admin/orders.ts`

这些接口具备代表性，覆盖：顾客下单、预约、用户资料、后台统计、后台订单与预约。

### 三、AdminScripts 拆分目标结构

建议把 `src/components/admin/AdminScripts.astro` 拆成以下脚本模块：

- `src/scripts/admin/core.ts`
  - fetch 包装
  - action delegation
  - toast
  - DOM helper
  - 安全 helper

- `src/scripts/admin/realtime.ts`
  - MQTT
  - SSE
  - 音频通知

- `src/scripts/admin/reservations.ts`
  - 预约统计
  - 预约列表
  - 状态更新
  - 预约打印

- `src/scripts/admin/menu.ts`
  - 分类/菜品增删改排序

- `src/scripts/admin/delivery.ts`
  - 骑手列表
  - 配送弹窗
  - 骑手选择与确认配送

- `src/scripts/admin/settings.ts`
  - 店铺设置
  - 区域/桌台配置
  - logo/location/delivery type

- `src/scripts/admin/stats.ts`
  - 统计表格
  - 汇率加载

- `src/scripts/admin/order-edit.ts`
  - 订单编辑弹窗
  - 加减菜品
  - 保存/打印订单

- `src/scripts/admin/import-export.ts`
  - 数据导入导出
  - 图片本地化

### 四、AdminScripts.astro 最终角色

`src/components/admin/AdminScripts.astro` 不再直接承载全部逻辑，而是作为装配层：

- 注入页面需要的 `shopId/shopSlug/settings/...`
- import 各 admin 脚本模块
- 调用一个统一的 `initAdminScripts(context)`

目标是把 `AdminScripts.astro` 压缩到大约 `200-350` 行量级。

## 拆分顺序

不建议从最复杂的实时模块开始。推荐顺序：

1. `reservations`
2. `order-edit`
3. `stats`
4. `delivery`
5. `menu`
6. `settings`
7. `import-export`
8. `realtime`

原因：

- 前三个模块我们刚做过安全清理，边界更清楚，适合作为拆分试点。
- `realtime` 与全局状态、音频、MQTT/SSE 耦合最高，留到后面最稳。

## 验证策略

每一批改动都必须有 fresh 验证证据：

- `pnpm run build`
- 对关键 admin 页面进行手工 smoke check
- 对首批 API 路由至少验证：
  - 参数非法时返回一致错误结构
  - 参数合法时保留原功能
  - 超时/后端不可用时错误格式一致

## 完成标准

满足以下条件，认为本轮设计目标达成：

- 高优先级 API 路由切入统一校验/错误基础层。
- `AdminScripts.astro` 主体职责被拆到业务域模块。
- `AdminScripts.astro` 只剩装配逻辑。
- `pnpm run build` 持续通过。
- 后台关键路径可正常工作：预约、订单编辑、统计、骑手配送。

## 非目标

本轮不追求：

- 一次性重写所有 API 路由。
- 一次性移除所有内联 `onclick`。
- 一次性重构 master 后台全部旧兼容层。

这些可以放入下一阶段持续推进。
