# 2026-04-08 配送 Telegram Webhook 契约设计（当前口径）

## 0. 目的
固化当前已稳定的 Telegram 派单链路契约，后续改动必须兼容本口径，避免再次引入状态流转与回调语义混乱。

---

## 1. webhook secret 校验与 callback 转发 rider-claim

### 1.1 `/api/telegram/webhook` 入站校验
- 必须校验请求头 `x-telegram-bot-api-secret-token`。
- 期望值来自 `readTelegramRequestSecret()`。
- 不通过时返回：
  - HTTP `401`
  - `{"success":false,"error":"unauthorized_telegram_request"}`

### 1.2 callback_query 内部执行 rider-claim
当 webhook body 同时存在 `callback_query.data` 与 `callback_query.message.chat.id`：
- 构造内部 `Request`，并在同进程内直接执行 rider-claim 处理函数
- 透传/附加头：
  - `Content-Type: application/json`
  - `x-telegram-claim-secret: <requestSecret>`
  - `cookie`（原样透传）
  - `authorization`（原样透传）
- body：
  - `callbackData`
  - `chatId`
- 说明：这里描述的是内部请求形态，不是 webhook 再通过公网/站内 HTTP 自调 `/api/telegram/rider-claim`

若 callback_query 缺少 `data` 或 `chat.id`：
- 当前实现**不转发** rider-claim
- webhook 继续按普通消息分支处理
- 若也不是合法 `/start bind_...` 消息，则返回：
  - HTTP `200`
  - `{"success":true,"ignored":true}`

### 1.3 webhook 对 callback 执行结果回包策略
- 当有 `callback_query.id` 时，回 Telegram API 兼容结构：
  - `{"method":"answerCallbackQuery","callback_query_id":"...","text":"..."}`
- 当无 callback id 时，回普通 JSON。
- rider-claim 上游失败时：
  - `expired_callback` 映射 `操作已过期`
  - 其他错误映射 `操作失败`

---

## 2. answerCallbackQuery 文案映射（当前固定）
由 webhook 根据 rider-claim 返回的 `action` 决定：
- `accept` → `已接单`
- `decline` → `已拒单`
- `picked_up` → `已取餐`
- `complete` → `已送达`

注：未识别 action 当前实现会默认落到“已接单”文案；这只是现有 fallback，不应被视为有效业务动作扩展口。若新增动作，必须先更新契约与测试。

---

## 3. rider-claim 动作面（四动作）
`/api/telegram/rider-claim` 仅支持并固化以下动作：
- `accept`
- `decline`
- `picked_up`
- `complete`

动作来源为 `parseTelegramClaimCallback(callbackData, ...)` 的解析结果，不接受 UI 侧自定义扩展动作名。

---

## 4. 身份/签名/过期/chatId 约束与错误语义

### 4.1 请求级鉴权
`/api/telegram/rider-claim` 接受以下任一 secret 头并做常量时序比较：
- `x-telegram-bot-api-secret-token`
- `x-telegram-claim-secret`

其中：
- `x-telegram-bot-api-secret-token` 是 Telegram webhook 入站主 secret
- `x-telegram-claim-secret` 是 webhook 内部转发到 rider-claim 时的兼容 header
- 当前实现两者都可用，但对外稳定入口应以 bot secret 为主，不应把 claim-secret 视为新的业务扩展口

不通过时：
- HTTP `401`
- `{"success":false,"error":"unauthorized_telegram_request"}`

### 4.2 入参约束
- 缺 `callbackData`：HTTP `400` + `callback_data_required`
- 缺 `chatId`：HTTP `400` + `chat_id_required`
- 非法 JSON：HTTP `400` + `invalid_json`

### 4.3 callback 安全约束
`parseTelegramClaimCallback` 与二次身份补全后，仅暴露以下安全错误：
- `expired_callback`
- `invalid_signature`
- `rider_identity_mismatch`
- 其他解析失败统一收敛为 `invalid_callback_data`

均返回：HTTP `400`。

### 4.4 chatId 与骑手身份绑定约束
- 回调中 rider 身份（name/phone/chatId）必须与当前 `chatId` 一致。
- 必须能解析出有效骑手姓名与手机号。
- 不一致或缺失：HTTP `400` + `rider_identity_mismatch`。

### 4.5 改派/失效约束
当 dispatch_meta 约束生效且动作不再允许（被改派、超时、失效等）：
- HTTP `409`
- `{"success":false,"error":"dispatch_invalidated","reason":"..."}`
- 常见 reason：`已改派`、`接单超时`

---

## 5. decline 语义（关键）

### 5.1 主状态不推进
`decline` 必须保持订单主状态为 `awaiting_courier`，禁止推进到 delivering/picked_up/completed。

### 5.2 反馈仅写入 remarks_json 内 dispatch_meta
`decline` 通过 `buildDispatchMetaRemarks` 写入：
- `lastRiderDecision.action = "declined"`
- `declinedRiderIds` 追加当前 riderId
- `invalidatedRiderIds` 追加当前 riderId
- 清空当前指派位：`currentRiderId/currentAssignedAt/currentExpiresAt`
- `lastInvalidationReason = "declined"`

并通过 `/api/order/update_status/:id` 提交：
- `expected_current_status = "awaiting_courier"`
- `status = "awaiting_courier"`
- `remarks_json = JSON.stringify(<remarks数组>)`

结论：decline 是“反馈记录 + 保持待接单”，不是主链状态推进。

---

## 6. accept / picked_up / complete 的 update_status payload 与 expected_current_status

统一调用：`POST /api/order/update_status/:id`

### 6.1 accept
- payload：
  - `id`
  - `expected_current_status: "awaiting_courier"`
  - `status: "delivering"`
  - `courier_name`
  - `courier_phone`
- 额外：先写 dispatch_meta 接单反馈（`lastRiderDecision.action = accepted`）。

### 6.2 picked_up
- payload：
  - `id`
  - `expected_current_status: "delivering"`
  - `status: "picked_up"`
  - `courier_name`
  - `courier_phone`

### 6.3 complete
- payload：
  - `id`
  - `expected_current_status: "picked_up"`
  - `status: "completed"`
  - `courier_name`
  - `courier_phone`

### 6.4 expected_current_status 的契约意义
前端/中间层声明“我认为当前状态应为 X”，后端据此做并发保护：
- 不匹配即拒绝（409），避免乱序回调覆盖。

---

## 7. 后端真源状态机与错误码
后端状态流转真源（Go）里，本文档关注的是**配送闭环相关迁移**。

其中配送子链主路径为：
- `awaiting_courier -> delivering -> picked_up -> completed`

当前实现里，与该闭环直接相连的入口接入还包括：
- `pending -> awaiting_courier`
- `confirmed -> awaiting_courier`

另外，当前实现还有两个需要明确的状态机语义：
- `from == to` 时视为允许（同态提交不拦截）
- 若 `from` 与 `to` 都不在白名单映射里，当前实现默认放行；因此本文档定义的是配送闭环稳定口径，不等同于系统全量状态治理规范

校验语义：
- `expected_current_status` 不匹配：
  - HTTP `409`
  - `error: "expected_current_status_mismatch"`
  - `code: "expected_current_status_mismatch"`
- 非法跳转：
  - HTTP `400`
  - `error: "invalid_status_transition"`
  - `code: "invalid_status_transition"`

---

## 8. telegram send 契约（后端 `/api/telegram/send`）

### 8.1 `shop_slug` 可空 + token 回退
- `shop_slug` 为空：直接使用全局（master settings）`telegram_bot_token`。
- `shop_slug` 非空：优先店铺 telegram token；若店铺未配则回退全局 token。

### 8.2 `reply_markup` 透传
请求体中 `reply_markup` 存在则原样透传至 Telegram `sendMessage` payload。

### 8.3 错误语义（当前实现口径）
- 参数缺失（chat_id/text）：`invalid_send_request`（400）
- 无可用 token：`telegram_bot_token_not_configured`（400）
- Telegram 调用失败/网络失败：`telegram_send_failed`（502）
- 若 `shop_slug` 查店失败，或店铺/全局配置读取失败，当前实现也会返回 `502`，且 `error` 直接透出底层错误文本；这属于当前实现口径，不应假定所有 `502` 都统一收敛为 `telegram_send_failed`
- 底层错误文本仅用于排障，不属于稳定契约字段，调用方不得依赖其具体文案

---

## 9. 禁止污染（强约束）

### 9.1 禁止引入临时字段
禁止在该链路请求/状态更新中引入以下临时或旁路字段：
- `surface`
- `fromAdmin`
- `uiState`
- `skipValidation`
- 以及同类“仅为绕过校验”的字段

### 9.2 dispatch_meta 仅存 remarks_json
- dispatch 元信息唯一落点：`remarks_json` 中 `dispatch_meta:*`。
- 读写必须统一使用共享 helper：
  - `readDispatchMetaFromRemarks`
  - `buildDispatchMetaRemarks`
- 不得平行写入其它临时字段或旁路存储，避免状态双轨。

---

## 10. 回归验证点（4 条）

1. **webhook secret + callback 文案回包**  
   使用合法 secret 触发四动作 callback，验证 `answerCallbackQuery.text` 分别为：已接单/已拒单/已取餐/已送达；`expired_callback` 在 webhook 层映射为 `操作已过期`，其他 callback 失败映射为 `操作失败`；secret 错误返回 401 unauthorized。

2. **decline 不推进主状态**  
   在 `awaiting_courier` 下执行 decline，验证订单状态仍为 `awaiting_courier`，且 `remarks_json` 中 `dispatch_meta` 出现 declined 反馈与 riderId 失效记录。

3. **主链顺序与 expected_current_status 防乱序**  
   依次验证 `awaiting_courier->delivering->picked_up->completed` 成功；任一阶段传错 `expected_current_status` 返回 409 + `expected_current_status_mismatch`；非法跳级返回 400 + `invalid_status_transition`。

4. **telegram send 回退与错误语义**  
   验证 `shop_slug` 为空时可走全局 token；`reply_markup` 可透传；参数缺失命中 `invalid_send_request`，缺 token 命中 `telegram_bot_token_not_configured`，外部发送失败命中 `telegram_send_failed`。

---

## 附：当前口径适用范围
- 本文档描述的是 **2026-04-08 当前实现口径**，用于稳定现网行为。
- 后续若需调整链路，先更新本契约，再改实现与测试。