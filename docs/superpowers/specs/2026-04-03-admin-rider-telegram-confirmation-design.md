# Admin 骑手 Telegram 测试与接单确认设计

## 背景
当前系统里，骑手端已经可以看到 `awaiting_courier` 状态的可抢订单，Telegram 也已有“立即接单”回调链路，但实际排障时存在两个问题：

1. 无法在 admin 侧直接验证“某个骑手是否能收到 Telegram 消息”。
2. Telegram 派单失败时，前端容易表现为表面成功，无法快速区分是配置透传问题还是派单发送问题。

用户要求本轮同时完成三件事：
- admin 增加面向单个骑手的 Telegram 测试按钮；
- 骑手收到 Telegram 通知后，需要确认接单；
- admin 要明确看到骑手已经接单。

## 目标
本轮实现一个闭环：

1. admin 可对单个已绑定 Telegram 的骑手发送测试消息；
2. 骑手通过 Telegram 消息中的“立即接单”完成确认；
3. admin 在订单状态与骑手信息上清楚看到“已接单 / 派送中”；
4. Telegram 发送失败时，admin 能直接看到可定位的错误。

## 非目标
本轮不做以下事情：
- 不重做骑手端整体 UI；
- 不新增独立的 Telegram 配置体系；
- 不改成新的确认协议或新的消息通道；
- 不把测试消息发到店铺群或 master 全局 chat，只发给单个骑手。

## 现状结论
### 已存在的能力
- 骑手端可从 `awaiting_courier` 列表中抢单。
- Telegram 接单回调已存在：`src/pages/api/telegram/rider-claim.ts`。
- 骑手端手动接单已存在：`src/pages/rider/dashboard.astro`。
- admin / master 已有与派单相关的 API：
  - `src/pages/api/admin/rider-assign.ts`
  - `src/pages/api/admin/rider-dispatch.ts`
- 实际 Telegram 发送链路复用 `/api/telegram/send`，后端由 `foos2Go/internal/handlers/telegram_send.go` 处理。

### 当前主要问题
- admin 缺少“按骑手测试 Telegram”的诊断入口，无法快速验证某个骑手的 `telegram_chat_id` 与当前店铺发送配置是否有效。
- `rider-assign` 的失败透出已经补到前端，但 `rider-dispatch` 这类广播/提醒链路仍缺少足够直接的失败展示。
- 用户怀疑 master 设置的 Telegram 参数没有正确传递到 admin 店铺发送链路，需要一个同源测试入口验证。

## 设计方案
### 1. admin 单骑手 Telegram 测试按钮
在 admin 的骑手展示区域，为每个骑手提供单独的 Telegram 测试按钮。

#### 行为
- 仅对已绑定 `telegram_chat_id` 的骑手显示可点击测试按钮。
- 未绑定的骑手显示禁用态或直接提示“未绑定 Telegram”。
- 点击后，admin 调用新的 shop-scoped 测试接口，目标 chat_id 为该骑手自己的 chat id。
- 消息文本包含：
  - 店铺名；
  - 骑手名；
  - 当前时间；
  - 固定说明“这是一条 admin 骑手 Telegram 测试消息”。

#### 设计原则
- 测试按钮必须复用真实 `/api/telegram/send` 链路，而不是单独写一套发送实现。
- 这样如果测试按钮成功，就能证明当前店铺上下文下的 token / shopSlug / 发送链路是通的。
- 如果测试按钮失败，前端直接显示底层错误，便于判断是否是配置透传问题。

### 2. 骑手确认接单
继续复用现有 Telegram “立即接单”回调设计，不新增第二套确认协议。

#### 行为
- Telegram 消息中的“立即接单”按钮继续指向现有回调能力。
- 回调成功后，订单更新为 `delivering`，并写入 `courierName / courierPhone`。
- 如果该单已被其他骑手接走，返回明确的状态冲突错误，而不是静默失败。

#### 设计原则
- `awaiting_courier` 表示“已通知待确认”；
- `delivering` 表示“骑手已确认接单并开始配送”；
- admin 不新增额外业务状态字段，继续复用现有订单状态，避免状态体系膨胀。

### 3. admin 明确显示“骑手已接单”
在 admin 订单卡片与相关交互文案中明确区分两个阶段：

- `awaiting_courier`：待骑手确认；
- `delivering`：骑手已接单 / 派送中。

#### 行为
- 当订单处于 `awaiting_courier` 时，admin 能理解为“已进入抢单池，但还没人确认”。
- 当订单进入 `delivering` 时，admin 明确看到已接单骑手姓名/电话。
- 必要时微调中文文案，避免 admin 将“可抢单”误以为“已有人接单”。

### 4. 失败透出与诊断闭环
本轮把“表面成功但实际失败”的链路补全。

#### rider-assign
- 保持当前已经补好的 `telegram_notification` 失败透出。

#### rider-dispatch
- 补前端调用方对以下字段的处理：
  - `failedCount`
  - `attempts`
  - `skippedReason`
- 至少提取首个失败原因显示给 admin。

#### admin 骑手测试按钮
- 成功：明确提示“测试消息已发送给某骑手”。
- 失败：直接展示底层错误，如：
  - `telegram_bot_token_not_configured`
  - `invalid_send_request`
  - `telegram_send_failed`
  - 或后端透传的真实响应。

## 方案选择理由
本轮采用“单骑手测试按钮 + 复用现有确认接单 + 补状态与失败透出”的组合方案，而不是单独只加一个测试按钮，原因是：

1. 只加测试按钮无法闭环验证真实接单流程；
2. 只修配置透传没有现场诊断入口，后续仍需反复下单验证；
3. 复用现有回调与状态模型，改动范围小、风险低、可快速交付。

## 文件边界
### 预计新增
- `src/pages/api/admin/rider-telegram-test.ts`
  - admin 侧面向单骑手的测试消息 API；
  - 做 shop 上下文校验；
  - 复用 `/api/telegram/send`。

### 预计修改
- `src/scripts/admin/settings-ui.ts`
  - 若骑手列表在该区域渲染，增加测试按钮绑定与反馈。
- 或对应 admin 骑手列表渲染文件
  - 增加“测试 Telegram”按钮展示。
- `src/pages/api/admin/rider-dispatch.ts`
  - 视需要补更稳定的错误结构或沿用现有结构。
- `src/scripts/master/dispatch-actions.ts`
  - 若继续使用 `rider-dispatch`，补失败透出。
- `src/components/admin/TabTables.astro`
  - 视需要微调 `awaiting_courier` / `delivering` 文案。
- `src/pages/rider/dashboard.astro`
  - 仅在必要时微调提示文案，不重写主流程。

### 后端相关
- `foos2Go/internal/handlers/telegram_send.go`
  - 继续作为真实发送能力，不重复实现。
- 若需要补 shop token 回退或错误响应结构，再最小修改。

## 数据流
### admin 骑手测试消息
1. admin 点击某骑手“测试 Telegram”；
2. 前端提交骑手 id / chat id / shopSlug；
3. admin API 生成测试文本；
4. admin API 调用 `/api/telegram/send`；
5. `/api/telegram/send` 解析 shop token / master token 回退并发送；
6. 前端显示成功或底层失败原因。

### 骑手 Telegram 确认接单
1. 派单消息发到骑手 Telegram；
2. 骑手点击“立即接单”；
3. Telegram 回调命中 `src/pages/api/telegram/rider-claim.ts`；
4. 订单状态更新为 `delivering`；
5. admin 订单列表刷新后显示“派送中”与骑手信息。

## 错误处理
### admin 测试按钮
- chat id 缺失：直接返回 `telegram_chat_id_missing`；
- token 未配置：返回 `telegram_bot_token_not_configured`；
- shop 上下文缺失：返回明确 shop 相关错误；
- Telegram upstream 失败：透传精简后的真实错误。

### 确认接单
- 回调签名无效：`unauthorized_telegram_request` 或 `invalid_signature`；
- 订单已被别人接走：返回状态冲突类错误；
- chat id 与回调身份不匹配：`rider_identity_mismatch`。

### 广播派单
- `failedCount > 0` 时，前端不再显示模糊成功；
- 至少展示首个失败骑手与失败原因。

## 测试策略
需要补的测试至少包括：

1. admin 单骑手 Telegram 测试 API
   - 成功发送；
   - 未绑定 chat id；
   - token 未配置；
   - upstream 失败时透出错误。

2. admin 前端按钮行为
   - 点击后发送正确 payload；
   - 成功时提示正确；
   - 失败时显示底层错误。

3. rider-dispatch 失败透出
   - `failedCount > 0` 时前端报错；
   - `skippedReason` / `attempts[0].error` 被提取显示。

4. 接单确认后的 admin 状态
   - `awaiting_courier` -> `delivering` 后文案与骑手信息正确显示。

## 验收标准
满足以下条件即视为本轮完成：

1. admin 可以对单个骑手发送 Telegram 测试消息；
2. 测试消息成功时，目标骑手能实际收到；
3. 失败时 admin 能直接看到可定位错误；
4. 骑手通过 Telegram 确认接单后，admin 明确看到该单已接单 / 派送中；
5. 不新增多余状态体系，不破坏现有 rider/dashboard 与 Telegram 回调链路。
