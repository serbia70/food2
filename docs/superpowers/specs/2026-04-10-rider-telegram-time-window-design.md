# 2026-04-10 骑手 Telegram 时限拆分设计

## 背景
当前 Telegram 骑手按钮存在时限语义混用问题：
- 派单阶段原本希望“5 分钟不接单自动续派”；
- 但 `已取餐`、`已送达` 也沿用了同一套 callback 过期机制；
- 结果是骑手进入真实配送阶段后，仍可能因为消息按钮过期而被拦截为“超时”。

这与当前业务目标冲突：
- 接单时限用于自动续派；
- 配送推进动作应由订单真实状态控制，而不是由 Telegram 消息寿命控制。

## 当前实现结论
### 1. callback 时限已按动作拆分
当前 `src/lib/telegram-dispatch.ts` 中：
- `TELEGRAM_CALLBACK_TTL_MS = 10 * 60 * 1000`
- `TELEGRAM_SHORT_CALLBACK_TTL_MS = 10 * 60 * 1000`
- 但 `shouldValidateTelegramCallbackExpiry(action)` 现在只对 `accept / decline` 返回 true

说明：
- 这里的 callback TTL 只是 Telegram 回调载荷层的安全时限，不是派单业务窗口真相；
- 真正决定 `accept / decline` 是否还能执行的业务时间窗口，仍以 `dispatch_meta.currentExpiresAt`（默认来自 `DISPATCH_AUTO_REASSIGN_MINUTES`，当前口径 5 分钟）为准。

这意味着：
- `accept / decline` 仍会在解析阶段命中 `expired_callback`；
- `picked_up / complete` 虽仍携带 `expiresAt`，但不会再因 callback TTL 直接失败。

### 2. 配送推进已改由业务状态机裁定
当前 `src/pages/api/telegram/rider-claim.ts` 中：
- `awaiting_courier` 阶段仍结合 dispatch 轮次与 `currentExpiresAt` 处理接单有效性；
- `picked_up / complete` 先检查订单真实状态，再结合当前骑手/dispatch 归属决定是否允许推进；
- 配送阶段失败错误已拆为：`order_status_updated`、`order_completed`、`dispatch_invalidated + reason`。

这说明当前实现已经落到目标模型：
- 接单阶段受超时控制；
- 配送阶段受真实状态与当前骑手身份控制。

## 目标
统一骑手 Telegram 时间规则：
1. 只有“接单 / 暂不接单”受当前派单窗口限制；
2. `已取餐`、`已送达` 不再因为 Telegram callback TTL 而误判超时；
3. Telegram、rider web、admin 三端统一认订单真实状态；
4. 自动续派只发生在 `awaiting_courier` 阶段；
5. 错误提示按业务原因区分，不再把所有失败都显示为“超时”。

## 最终规则

### 阶段 A：待接单
状态：`awaiting_courier`

动作：
- `accept`
- `decline`

规则：
- 有效期由当前派单窗口控制，默认来自 `DISPATCH_AUTO_REASSIGN_MINUTES`（当前默认 5 分钟）；
- 派单窗口内未接单，可自动续派给下一位骑手；
- 旧骑手历史按钮必须失效；
- 失效原因由后端统一返回：
  - `接单超时`
  - `已改派`

### 阶段 B：已接单待取餐
状态：`delivering`

动作：
- `picked_up`

规则：
- 不设 5 分钟硬超时；
- 只校验：
  - 当前订单状态仍为 `delivering`；
  - 当前骑手仍为该单有效骑手；
- 若状态已变化或身份不匹配，则拒绝操作。

### 阶段 C：已取餐待送达
状态：`picked_up`

动作：
- `complete`

规则：
- 不设 5 分钟硬超时；
- 只校验：
  - 当前订单状态仍为 `picked_up`；
  - 当前骑手仍为该单有效骑手；
- 若状态已变化或身份不匹配，则拒绝操作。

## 核心设计决策

### 决策 1：接单窗口与配送动作彻底拆开
`accept / decline` 的 5 分钟窗口，本质是“当前派单轮是否有效”。

`picked_up / complete` 的合法性，本质是“订单当前真实状态是否允许推进”。

两者不是同一种时间概念，不能继续复用同一 TTL。

### 决策 2：配送阶段以状态机为准，不以消息寿命为准
Telegram 只是一个操作入口，不是业务真相来源。

因此配送阶段的按钮合法性由以下条件共同决定：
- 订单当前状态；
- 当前骑手身份；
- 订单是否仍属于该骑手处理。

而不是由“这条 Telegram 消息发出去多久了”决定。

### 决策 3：后续如需时限，只做提醒，不做硬失效
未来如果需要运营约束，可以单独增加：
- 接单后 X 分钟未点 `已取餐` → 提醒 admin / 骑手；
- 取餐后 Y 分钟未点 `已送达` → 提醒 admin / 骑手。

但这些属于 SLA/提醒，不属于 Telegram callback 硬过期规则。

## 错误文案口径

### 接单阶段
- `接单超时`
- `已改派`

### 配送推进阶段
- `订单状态已更新`
- `订单已完成`
- `已改派`
- 仅当回调 chatId 与骑手身份解析不一致时，返回 `当前订单不属于你`

要求：
- 不再把 `picked_up / complete` 的失败统一映射为“操作已过期”；
- `dispatch_invalidated + reason = "已改派"` 在 webhook 层映射为 `已改派`；
- `rider_identity_mismatch` 仅用于身份绑定不一致场景，并在 webhook 层映射为 `当前订单不属于你`；
- 文案尽量表达真实业务原因，而不是技术性 callback 失败。

## 实现影响点

### 1. callback 生成与解析
文件：`src/lib/telegram-dispatch.ts`

当前实现已完成按动作区分时限策略：
- `accept / decline`：保留过期时间并执行过期校验；
- `picked_up / complete`：仍保留 callback 中的 `expiresAt` 字段，但不参与硬 TTL 拦截。

当前口径：
- callback payload 保留 action；
- 解析时仅对 `accept / decline` 执行过期校验；
- `picked_up / complete` 交由后续业务状态判断。

### 2. Telegram claim 接口
文件：`src/pages/api/telegram/rider-claim.ts`

当前实现已保证：
- `accept / decline` 继续受当前轮派单有效性约束；
- `picked_up / complete` 失败时优先返回业务原因，而不是 callback 超时原因；
- 配送动作的可操作性由订单状态与当前骑手身份决定；
- 配送阶段错误已明确拆为 `order_status_updated`、`order_completed`、`dispatch_invalidated + reason`。

### 3. 共享派单状态 helper
文件：`src/lib/rider-dispatch.ts`

当前方向基本正确，应继续保持：
- `awaiting_courier`：看 `currentExpiresAt`；
- `delivering / picked_up`：看当前骑手与订单状态；
- 不把接单超时概念扩散到配送推进阶段。

### 4. webhook 文案映射
文件：`src/pages/api/telegram/webhook.ts`

当前实现已同步：
- `expired_callback` 只保留给接单阶段过期语义；
- 配送阶段失败按 `order_status_updated` / `order_completed` / `dispatch_invalidated + reason` 映射为更贴近业务的提示文案；
- 其中 `dispatch_invalidated + reason = "已改派"` 映射为 `已改派`，`rider_identity_mismatch` 才映射为 `当前订单不属于你`。

## 三端统一语义

### Telegram
- 待接单：5 分钟内确认是否接单；
- 已接单后：继续靠真实状态推进 `已取餐`、`已送达`。

### rider web
- 与 Telegram 使用同一套业务判定；
- 不单独发明另一套超时概念。

### admin
- 超时自动续派只发生在待接单阶段；
- 取餐/送达阶段只反映真实配送状态，不显示“接单超时”类误导语义。

## 最小实现边界
本轮只处理：
1. 接单按钮保留 5 分钟时限；
2. `已取餐`、`已送达` 去掉当前硬超时语义；
3. 配送阶段失败提示改成真实业务原因；
4. 三端统一按状态机判定动作合法性。

本轮不处理：
- 每店独立超时策略；
- 每骑手独立策略；
- 配送超时自动关单；
- 复杂 SLA 统计；
- 大规模重做 Telegram 消息形态。

## 验证要点
1. 派单后 5 分钟内点击 `接单`，成功；
2. 派单超时后点击旧 `接单`，返回 `接单超时` 或 `已改派`；
3. 接单成功后，超过 5/10 分钟再点 `已取餐`，只要订单仍是 `delivering` 且骑手匹配，就应成功；
4. `已取餐` 后，超过 5/10 分钟再点 `已送达`，只要订单仍是 `picked_up` 且骑手匹配，就应成功；
5. 若订单已被他人推进或已完成，旧按钮返回业务失败提示，而不是统一 `超时`。

## 结论
当前实现采用以下统一口径：
- **默认 5 分钟派单窗口只限制接单阶段**；
- **配送推进阶段不使用 Telegram 按钮硬超时**；
- **配送动作合法性完全由订单状态与当前骑手身份决定**；
- **配送阶段失败错误统一收口为 `order_status_updated` / `order_completed` / `dispatch_invalidated + reason`**。
