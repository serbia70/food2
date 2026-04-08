# 2026-04-08 配送 Telegram Webhook Hardening（稳定闭环口径）

## 0. 目的与边界

本文只记录**当前已稳定实现**的加固口径，服务于配送闭环（awaiting_courier → delivering → picked_up → completed）。

- 不发明新契约，不新增动作面。
- 重点回答：**哪些点最容易再次坏掉、为什么会坏、改动前后如何防回归**。
- 契约真源以既有文档与现有代码为准。

关联文档：
- `D:\ai\food\.worktrees\260311\food2astro\docs\superpowers\specs\2026-04-08-delivery-telegram-webhook-contract-design.md`
- `D:\ai\food\.worktrees\260311\food2astro\docs\superpowers\specs\2026-04-07-rider-delivery-status-closed-loop-design.md`

---

## 1) 本轮已收口的真源列表（前端 / 后端 / 文档）

### 1.1 文档真源（口径锚点）

1. Telegram webhook 与 rider-claim 契约：
   - `D:\ai\food\.worktrees\260311\food2astro\docs\superpowers\specs\2026-04-08-delivery-telegram-webhook-contract-design.md`
2. 配送闭环状态机与多端一致性：
   - `D:\ai\food\.worktrees\260311\food2astro\docs\superpowers\specs\2026-04-07-rider-delivery-status-closed-loop-design.md`

### 1.2 前端/BFF 真源（Astro）

1. webhook 入站校验 + callback 转发执行：
   - `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\telegram\webhook.ts`
2. rider-claim 动作处理（accept/decline/picked_up/complete）：
   - `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\telegram\rider-claim.ts`
   - 关键依赖链：
     - `/api/rider/status?action=list_available`（按 chatId 补全骑手身份 / decline 续派候选）
     - `/api/admin/orders`（读取订单快照与 dispatch_meta）
     - `/api/admin/orders/remarks`（写 dispatch_meta 反馈）
     - `/api/admin/rider-dispatch`（decline 后尝试立即续派下一位骑手）
3. 订单状态更新转发（含动态路由 `[id]`）：
   - `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\order\update_status.ts`
   - `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\order\update_status\[id\].ts`
4. Telegram 发送代理（shop / admin_master / master / home 多来源 token 回退 + reply_markup 透传）：
   - `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\telegram\send.ts`
5. 配送元信息唯一 helper（dispatch_meta 读写）：
   - `D:\ai\food\.worktrees\260311\food2astro\src\lib\rider-dispatch.ts`
6. callback 结构与签名真源（含 rc2 短回调）：
   - `D:\ai\food\.worktrees\260311\food2astro\src\lib\telegram-dispatch.ts`

### 1.3 后端真源（Go）

1. 配送状态机跃迁判定：
   - `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_status_flow.go`
2. Telegram 出站发送（/api/telegram/send）：
   - `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\telegram_send.go`

---

## 2) 本轮实际踩过的故障模式与禁止回归项

以下都属于“很容易再次被改坏”的高危点。

### 故障模式 A：webhook callback 走自调公网/错误基址，导致 404 或链路断

- 现象：callback 触发后无状态变更，或线上 404。
- 根因：把 callback 处理写成“再 HTTP 调自己”，依赖站点域名/反向代理路径，环境一变就断。
- 当前收口：`webhook.ts` 直接调用 `handleTelegramRiderClaim`（函数内执行），不依赖自调公网。
- 禁止回归：禁止恢复“webhook callback -> 自调 /api/telegram/rider-claim HTTP”模式。

### 故障模式 B：callback 回包语义错，Telegram 侧看起来“点了没反应”

- 现象：按钮点击后用户端无明确反馈。
- 根因：callback 分支没返回 `answerCallbackQuery` 结构，或文案映射错误。
- 当前收口：有 `callback_query.id` 时返回 `{method:"answerCallbackQuery", callback_query_id, text}`。
- 禁止回归：
  - 不得把 callback 分支退化成普通 JSON。
  - 不得丢失 action→文案映射（已接单/已拒单/已取餐/已送达）。

### 故障模式 C：decline 错推进主状态，或只写反馈不续派，闭环语义被污染

- 现象：骑手拒单后订单被推进到 delivering 或其它主状态；或者虽然写了拒单反馈，但没有继续把单派给下一位可用骑手。
- 根因：把拒单当成主链动作处理，或把 decline 错当成“只记一笔备注就结束”。
- 当前收口：decline 先写 dispatch_meta 反馈，主状态保持 `awaiting_courier`；随后尝试挑下一位可用骑手并调用 `/api/admin/rider-dispatch` 立即续派。
- 禁止回归：
  - decline 不得推进主状态机；
  - decline 相关回归不能只验“状态没变”，还必须验证续派链路是否仍被触发。

### 故障模式 D：dispatch_meta 旁路写入导致多真源

- 现象：admin/rider/telegram 各自读到不同“已拒单/已改派”结果。
- 根因：把调度元信息写到 remarks_json 之外的临时字段，或多处拼装。
- 当前收口：dispatch_meta 仅存 `remarks_json`，只用 `readDispatchMetaFromRemarks` / `buildDispatchMetaRemarks`。
- 禁止回归：
  - 禁止新增平行元信息落点。
  - 禁止在 update_status payload 引入临时旁路字段。

### 故障模式 E：expected_current_status 被省略或错传，乱序回调覆盖真实状态

- 现象：旧按钮/慢请求把新状态覆盖回去。
- 根因：缺少并发保护，或动作阶段 expected_current_status 不匹配。
- 当前收口：
  - accept: awaiting_courier -> delivering
  - picked_up: delivering -> picked_up
  - complete: picked_up -> completed
  - 后端 mismatch 返回 409 `expected_current_status_mismatch`。
- 禁止回归：任何推进动作不得移除 expected_current_status。

### 故障模式 F：Telegram send token 链路分叉，偶发“未配置 token”或 502

- 现象：同样配置下，有时能发有时报 `telegram_bot_token_not_configured`/`telegram_send_failed`。
- 根因：shop/master/admin/home 多路回退逻辑被改裂，或字段形态兼容退化。
- 当前收口：`shop_slug` 可空；支持 `shopSlug/shop_slug` 输入；token 解析按 inline token -> shop -> admin_master -> master -> home 多来源回退。
- 禁止回归：
  - 不得把发送强绑 shop_slug。
  - 不得删除 reply_markup 透传。

### 故障模式 G：兼容 header/字段一刀切删除，导致历史入口立刻失效

- 现象：某端点击立刻 401/400。
- 根因：过早删兼容层（如 `x-telegram-claim-secret`、`shop_slug`）。
- 当前收口：保留兼容入口，但定义了删除条件（见第 5 节）。
- 禁止回归：未满足删除条件不得清理兼容层。

---

## 3) 修改原则（硬约束）

### 3.1 最小改动

- 只改当前链路的最短路径，不重写整套消息/状态系统。
- 每次改动必须能映射到一个具体回归点（测试或人工链路）。

### 3.2 共享 helper 优先

- dispatch_meta 读写只走：
  - `readDispatchMetaFromRemarks`
  - `buildDispatchMetaRemarks`
- callback 解析/签名只走：
  - `parseTelegramClaimCallback`
  - `buildTelegramShortClaimCallback`

### 3.3 remarks_json 唯一落点

- 调度反馈（declined/invalidated/current rider 等）只存 `remarks_json` 的 `dispatch_meta:*`。
- 禁止新增 DB 列、临时缓存键、页面本地态作为“第二真源”。

### 3.4 避免旁路字段

以下属于明确禁止项（含同类变体）：
- `surface`
- `fromAdmin`
- `uiState`
- `skipValidation`

原则：公共状态接口只接受业务必需字段（id/status/expected_current_status/courier/remarks_json）。

---

## 4) 回归验证矩阵（前端测试 / Go 测试 / 人工链路）

### 4.1 前端（Node test）

1. webhook 合约：
   - 文件：`D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-webhook.test.ts`
   - 关注点：secret 校验、callback 处理、answerCallbackQuery 文案、错误映射。

2. rider-claim 合约：
   - 文件：`D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-rider-claim.test.ts`
   - 关注点：
     - 四动作 accept/decline/picked_up/complete
     - decline 不推进主状态且落 dispatch_meta
     - decline 后立即续派下一位骑手
     - dispatch_invalidated / expired_callback / rider_identity_mismatch
     - accept 后发送“已取餐”按钮消息
     - picked_up 后发送“已送达”按钮消息

3. telegram-send 合约：
   - 文件：`D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-send.test.ts`
   - 关注点：shopSlug/shop_slug 兼容、shop_slug 可空走全局 token、reply_markup 透传、错误码。

4. update_status 动态路由：
   - 文件：`D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\order-update-status.test.ts`
   - 关注点：`[id]` 路由转发正确，缺 id 返回 `order_id_required`。

### 4.2 Go（后端）

1. 订单状态机：
   - 文件：`D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_status_flow_test.go`
   - 关注点：
     - `delivering -> picked_up` 合法
     - `picked_up -> completed` 合法
     - 非法跳转 `invalid_status_transition`
     - `expected_current_status_mismatch`
     - `remarks_json` 持久化（decline 反馈路径）

2. Telegram send：
   - 文件：`D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\telegram_send_test.go`
   - 关注点：token 回退、reply_markup 透传、出站失败语义。

### 4.3 人工链路（上线前最少跑 1 次）

1. admin 派单 -> Telegram 收到“接单/暂不接单”按钮。
2. Telegram 点“接单” -> admin/rider 同步为 delivering，且骑手收到下一阶段“已取餐”按钮。
3. Telegram 点“已取餐” -> 状态变 picked_up，并收到“已送达”按钮。
4. Telegram 点“已送达” -> 状态 completed，多端同步。
5. Telegram 点“暂不接单” -> 状态仍 awaiting_courier，admin 可见拒单反馈，且若存在下一位可用骑手则立即续派。
6. callback 安全错误回包：`expired_callback -> 操作已过期`；`dispatch_invalidated` 与其他失败当前统一回 `操作失败`。
7. 旧按钮重放（过期/改派后）-> 明确失败，不脏写状态。

---

## 5) 临时兼容层/残留清单与删除条件

### 5.1 兼容层清单

1. rider-claim 接受 `x-telegram-claim-secret`
- 现状：兼容 webhook 内转发头，主入口仍是 `x-telegram-bot-api-secret-token`。

2. send 入参兼容 `shopSlug` 与 `shop_slug`
- 现状：两者都支持，避免不同调用端断裂。

3. webhook action 文案默认 fallback（未知 action 默认“已接单”）
- 现状：为了容错保留，但不是可扩展动作口。

4. telegram-send 多来源 token 回退链（shop/admin_master/master/home）
- 现状：用于兼容不同部署与鉴权上下文。

### 5.2 删除条件（必须全部满足）

1. 可观测性前置：先补兼容入口命中观测（至少能区分 `x-telegram-claim-secret`、`shopSlug/shop_slug`、未知 action fallback 是否仍被使用）。
2. 观测窗口：在“已具备入口观测”的前提下，连续 14 天无命中旧兼容路径（按入口分别统计）。
3. 测试约束：新增“禁用旧入口”红灯测试并通过（先加测再删）。
4. 文档同步：先更新契约文档，再删实现，再删测试兼容断言。
5. 回滚方案：保留可回滚 commit 或 feature 开关，不做一次性不可逆清理。

未满足以上条件，兼容层只允许“收敛注释/日志”，不得删除。

---

## 6) 后续改动前检查清单（执行前逐条勾）

1. 我这次是否改动了以下任一真源：webhook / rider-claim / update_status / telegram-send / dispatch_meta helper / telegram-dispatch helper？
2. rider-claim 依赖链是否一起检查了：`list_available` / `admin/orders` / `admin/orders/remarks` / `admin/rider-dispatch`？
3. 是否仍满足单一状态机：awaiting_courier -> delivering -> picked_up -> completed？
4. decline 是否仍只写 remarks_json(dispatch_meta) 且主状态不推进？
5. decline 后若存在下一位可用骑手，是否仍会触发立即续派？
6. 是否新增了任何旁路字段（surface/fromAdmin/uiState/skipValidation 类）？若有必须删除。
7. 是否保留 expected_current_status 并按阶段正确传递？
8. callback 分支是否仍返回 answerCallbackQuery（有 callback id 时）？
9. accept 后是否仍会发“已取餐”按钮，picked_up 后是否仍会发“已送达”按钮？
10. reply_markup 是否仍原样透传到 telegram send？
11. shop_slug 可空时是否仍可走全局 token？
12. 是否改动了兼容层？若改动，是否满足第 5 节删除条件？
13. 是否已补齐最小回归矩阵证据：
   - 前端 4 组（webhook/rider-claim/send/update_status）
   - Go 2 组（order_status_flow/telegram_send）
   - 人工链路 7 步
   - 若 webhook 层的 `expired_callback -> 操作已过期` 映射还没有单独断言，不要把矩阵写成已闭合

---

## 7) 结论（本轮 hardening 核心）

当前闭环最脆弱的不是“功能缺失”，而是**多入口下的真源漂移**：
- callback 处理路径漂移（自调 HTTP / 错域名）
- 状态推进真源漂移（expected_current_status 丢失）
- 调度反馈真源漂移（remarks_json 之外再存一份）

本次 hardening 的底线是：
- 状态机真源固定在后端状态流；
- 调度反馈真源固定在 remarks_json(dispatch_meta)；
- webhook/rider-claim/send 只做最小必要兼容，不扩业务口径。
