# Admin Rider Claim Message Design

**Goal**

让 admin 在“指派骑手”后，骑手收到的 Telegram 私聊消息直接包含订单关键信息与“立即接单”按钮；骑手点击后复用现有 claim 链路把订单状态从 `awaiting_courier` 更新为 `delivering`，并让 admin 明确看到该骑手已接单。

## Current State

- `src/pages/api/admin/rider-assign.ts` 目前在指派成功后只给骑手发送一条纯文本消息：`订单已指派给你：{riderName}`。
- 该消息没有订单摘要，也没有 Telegram inline button，因此骑手无法直接在 Telegram 内确认接单。
- `src/pages/api/telegram/rider-claim.ts` 已经具备签名校验、chat_id 匹配、以及把订单从 `awaiting_courier` 改成 `delivering` 的能力。
- `src/components/admin/TabTables.astro` 已经把 `awaiting_courier` 展示为“待骑手确认”，`delivering` 展示为“骑手已接单”，并在 `delivering` 时显示 `courierName` / `courierPhone`。

## Recommended Approach

复用现有 `rider-claim` 机制，不引入第二套接单协议。

在 admin 指派骑手成功后：
1. 从当前订单上下文中提取 Telegram 需要展示的订单摘要。
2. 为当前被指派骑手生成 claim callback 数据。
3. 调用现有 `/api/telegram/send` / 后端 Telegram send 链路时，把“订单摘要 + inline keyboard”一起发给该骑手。
4. 骑手点击“立即接单”后，仍由 `src/pages/api/telegram/rider-claim.ts` 负责验签、验 chat_id、更新订单状态。
5. admin 页面继续依赖订单状态和 `courier_*` 字段回显，不新增独立“是否已接单”字段。

## Scope

### In scope
- admin 指派消息改成带订单详情
- admin 指派消息加入 Telegram “立即接单”按钮
- 复用现有 `rider-claim` 更新订单状态
- admin 明确显示骑手已接单
- 把 Telegram 发送失败继续显式透出给 admin

### Out of scope
- 不新增骑手拒单按钮
- 不新增第二套 rider claim API
- 不修改 rider dashboard 接单逻辑
- 不新增“接单时间”或审计历史字段
- 不做批量多骑手广播确认

## Message Contract

admin 指派给单骑手时，Telegram 消息至少包含：
- 订单号 / 取餐号
- 配送地址（`tableInfo`）
- 用户电话
- 菜品摘要
- 订单金额
- 预约送达时间（若存在）

按钮区包含：
- `立即接单`

按钮点击后携带的 callback data 继续遵循现有签名 callback 约束，包含：
- orderId
- riderPhone
- riderName
- telegramChatId
- 过期时间 / 签名

## Data Flow

### 1. Admin 指派
- admin 在后台点击“指派骑手”
- `src/pages/api/admin/rider-assign.ts` 更新订单状态为 `awaiting_courier`
- 同一请求内构造 Telegram 消息文本和 inline keyboard
- 向被指派骑手的 `telegram_chat_id` 发送消息

### 2. Rider Telegram 接单
- 骑手点击 `立即接单`
- Telegram webhook/桥接层把 callback data 与 chatId 发给 `src/pages/api/telegram/rider-claim.ts`
- `rider-claim.ts` 校验：
  - secret header
  - callback 签名与过期时间
  - callback 中的 `telegramChatId` 与当前 chatId 一致
- 校验通过后，调用订单状态更新接口：
  - `expected_current_status = 'awaiting_courier'`
  - `status = 'delivering'`
  - 写入 `courier_name` / `courier_phone`

### 3. Admin 回显
- admin 刷新列表或轮询后看到：
  - 状态从“待骑手确认”变为“骑手已接单”
  - 卡片内显示当前骑手姓名或电话

## Failure Handling

### Admin 指派成功但 Telegram 发送失败
保持现在策略：
- 订单状态更新成功仍返回成功
- 响应体继续带 `telegram_notification` 错误摘要
- admin 前端必须把该错误显示出来，不能伪装成完全成功

### Rider 点击失效按钮
`src/pages/api/telegram/rider-claim.ts` 继续返回明确错误：
- `expired_callback`
- `invalid_signature`
- `rider_identity_mismatch`
- 或上游订单状态更新失败信息

### 订单已被其他流程改走
通过 `expected_current_status = 'awaiting_courier'` 防止覆盖；若状态已改变，本次接单失败并返回明确错误。

## UI Semantics

admin 端维持单一事实来源：订单状态。
- `awaiting_courier`：待骑手确认
- `delivering`：骑手已接单

`delivering` 状态下继续显示：
- `courierName`
- 若姓名为空则回退 `courierPhone`

不新增额外布尔字段如 `riderAccepted`。

## Files Likely To Change

- `src/pages/api/admin/rider-assign.ts`
  - 从纯文本改为订单摘要 + claim button
- `src/lib/telegram-dispatch.ts`
  - 如已有 callback builder，则复用；如缺少 admin 指派消息构造函数，则在现有 dispatch 工具里补齐
- `src/pages/api/telegram/rider-claim.ts`
  - 只做必要兼容，不重写协议
- `src/tests/pages/api/admin-rider-assign.test.ts`
  - 断言消息文本与按钮 payload
- `src/tests/pages/api/telegram-rider-claim.test.ts`
  - 断言接单后状态变为 `delivering`
- `src/components/admin/TabTables.astro`
  - 仅在需要时微调文案/显示，不新增第二套状态逻辑

## Testing Strategy

### API tests
- admin 指派测试覆盖：
  - 发送内容包含订单摘要
  - 发送 payload 包含 inline keyboard
  - callback data 绑定当前骑手 chat_id / phone / name
- rider claim 测试覆盖：
  - 正常点击后状态更新为 `delivering`
  - chat_id 不匹配时拒绝
  - 过期签名时拒绝

### UI tests
- admin 订单卡测试覆盖：
  - `awaiting_courier` 显示“待骑手确认”
  - `delivering` 显示“骑手已接单”
  - `delivering` 时显示骑手姓名/电话

## Tradeoffs Considered

### 方案 A：复用现有 rider-claim（采用）
优点：
- 改动最小
- 现有安全边界已存在
- admin / Telegram / 订单状态三端语义一致

缺点：
- 需要在 admin 指派时补齐订单摘要与按钮构造

### 方案 B：新建 admin 专用 claim API（不采用）
缺点：
- 重复协议
- 增加维护成本
- 更容易产生状态分叉

### 方案 C：只发详情，不支持 Telegram 直接接单（不采用）
缺点：
- 不满足“骑手消息里直接接单”的目标

## Acceptance Criteria

- admin 指派单个骑手后，该骑手收到包含订单摘要的 Telegram 私聊消息
- 该消息包含“立即接单”按钮
- 骑手点击后，订单状态从 `awaiting_courier` 变成 `delivering`
- admin 页面明确显示“骑手已接单”以及骑手姓名/电话
- 若 Telegram 发送失败，admin 能看到真实失败信息
