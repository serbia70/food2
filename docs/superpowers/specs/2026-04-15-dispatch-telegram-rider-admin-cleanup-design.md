# Dispatch / Telegram / Rider / Admin Cleanup Design

> 状态说明（当前仍可参考）：这份设计主要用于沉淀 dispatch / Telegram / rider / admin 链路的真实接口与共享事实源；其中出现的旧后端测试文件名应理解为历史定位线索，不应被当作当前必须继续沿用的搜索锚点。

**Goal:** 把最近几天 dispatch / Telegram / rider client / admin 这条链路的真实修改、接口依赖、重复点和清理顺序沉淀下来，避免后续继续凭记忆和猜测修改。

**Why now:** 这几天已经反复出现同类问题：修了一处漏另一处、同一语义在多条链路平行实现、旧命名和兼容层误导后续修改、admin orders 与 rider orders 字段不一致导致 Telegram / rider 侧导航和店铺信息丢失。

**Non-goals:**
- 不在这一轮直接重做后端主状态机
- 不新增第二套 rider action API
- 不把所有清理一次性混成大重构
- 不把前端消费端归一逻辑再搬回代理层

---

## 1. 最近几天修改摘要

### 1.1 前端主线
最近几天的热点集中在：
- `src/pages/api/telegram/rider-claim.ts`
- `src/pages/api/rider/action.ts`
- `src/pages/api/admin/rider-assign.ts`
- `src/pages/api/admin/rider-dispatch.ts`
- `src/lib/rider-dispatch.ts`
- `src/lib/rider-route-shared.ts`
- `src/lib/telegram-dispatch.ts`
- 多份 `*-spec.ts`

这轮变化的核心不是单点修 bug，而是整条链路在收敛：
1. Telegram 成为骑手主入口
2. rider dashboard 与 Telegram 使用同一套状态词 / 动作词 / dispatch_meta 语义
3. Telegram 对单个订单始终只保留一条可编辑消息
4. `accept / decline / picked_up / complete` 都回到共享状态推进逻辑
5. admin orders 拉不到时，允许 fallback 到 rider orders 保住状态推进与导航字段

### 1.2 后端主线
后端当前最关键的近期变化集中在：
- `foos2Go/internal/handlers/order_list_flow.go`
- `foos2Go/internal/handlers/mobile.go`
- `foos2Go/internal/handlers/order_dto.go`
- `foos2Go/internal/handlers/order_dto_test．go（历史文件名）`
- `foos2Go/internal/handlers/order_status_flow.go`
- `foos2Go/internal/handlers/telegram_send.go`

最近已经补齐的关键读模型字段：
- `shopName`
- `restaurantName`
- `restaurantAddress`
- `shopMapUrl`

这些字段现在已经成为 Telegram 指派消息、接单后单消息编辑、rider dashboard 店铺/导航展示的事实来源之一。

---

## 2. 当前关键接口清单

| Surface | 前端 route | 后端 route | 关键字段 | 副作用 / 说明 |
| --- | --- | --- | --- | --- |
| Admin 订单列表 | `src/pages/api/admin/orders.ts` | `${API_BASE_URL}/api/admin/orders` | `status` `remarksJson` `shopName` `restaurantAddress` `shopMapUrl` `itemsJson` | 现已是纯薄代理；`itemsJson` 归一责任下沉到 admin 消费端 |
| Admin 手动指派 | `src/pages/api/admin/rider-assign.ts` | 读 `/api/admin/orders`、`/api/admin/riders`；写 `/api/admin/orders/:id/status`、`/api/admin/orders/remarks` | `orderId` `riderId` `pickupEtaMinutes` `shopSlug` | 发送 Telegram 指派消息并回写 `telegramMessageRef` |
| Admin publish/remind/republish | `src/pages/api/admin/rider-dispatch.ts` | 读 `/api/admin/orders`、`/api/admin/riders`；写 `/api/admin/orders/remarks` | `action` `orderId` `forceRiderId` | 广播/提醒/超时重派 |
| Rider dashboard 动作 | `src/pages/api/rider/action.ts` | `${API_BASE_URL}/api/order/update_status/:id` + `/api/admin/orders/remarks` | `action` `orderId` `riderId` `riderPhone` | 成功后 edit Telegram 原消息 |
| Telegram callback 动作 | `src/pages/api/telegram/rider-claim.ts` | `${API_BASE_URL}/api/order/update_status/:id` + `/api/admin/orders/remarks` + `/api/admin/rider-dispatch` | callback 中的 `orderId` `riderId` `restaurantId` | decline 时可自动续派，成功后 edit 原消息 |
| Rider 订单列表 | `src/pages/api/rider/orders.ts` | `${API_BASE_URL}/api/rider/orders` | `status` `courierPhone` `shopName` `restaurantAddress` `shopMapUrl` | 当前是 Telegram 读订单详情的重要 fallback 来源 |
| Order status proxy | `src/pages/api/order/update_status.ts` / `[id].ts` | `${API_BASE_URL}/api/order/update_status/:id` | `status` `expectedCurrentStatus` `courierName` `courierPhone` `remarksJson` | public 薄代理；负责 id 归一、header 透传、`invalid_json`/`order_id_required` 入口错误 |
| Admin order status proxy | `src/pages/api/admin/orders/[id]/status.ts` | `${API_BASE_URL}/api/admin/orders/:id/status` | 透传 admin body（如 `status` `pickupEtaMinutes` `remarksJson` 等） | admin 薄代理；保留 `PUT` method、原样 body、admin_token/cookie 鉴权语义 |
| Telegram send | `src/pages/api/telegram/send.ts` | 后端 `/api/telegram/send` 或直接 Telegram Bot API | `chatId` `messageId` `replyMarkup` `shopSlug` | 支持 send 与 edit message |

---

## 3. 当前共享事实源

后续修改优先以这些文件为准，不要在页面脚本或 route 内重新发明语义：

### 前端共享事实源
- `src/lib/rider-dispatch.ts`
  - `dispatch_meta` 读写
  - rider 状态/动作统一判定
  - 导航 URL 与视图字段
  - 导航源字段提取规则：
    - 取餐导航优先 `shopMapUrl`，缺失时回退 `shopAddress || restaurantAddress`
    - 送餐导航优先 `deliveryMapUrl`，缺失时回退 `tableInfo || deliveryAddress`
    - 地址回退统一走清洗：去掉姓名/电话前缀、`[货到付款/Cash]`、`(备注:...)`
    - Telegram / rider dashboard 只消费这里产出的 `shopMapUrl` / `deliveryMapUrl`，不要各自再拼导航
- `src/lib/rider-route-shared.ts`
  - 订单详情读取
  - forward headers
  - remarks 写回
  - Telegram 摘要解析
- `src/lib/telegram-dispatch.ts`
  - Telegram 单消息正文
  - inline keyboard
  - callback 编解码
- `src/lib/rider-assignment.ts`
  - 骑手可派发/续派选择规则
- `src/lib/order-items-shared.ts`
  - admin / rider / telegram / 用户侧共用的 `itemsJson` 解析
  - 用户侧商品摘要文本格式化

### 后端共享事实源
- `foos2Go/internal/handlers/order_status_flow.go`
  - 订单状态推进真相
- `foos2Go/internal/handlers/order_dto.go`
  - 订单对外输出字段合同
- `foos2Go/internal/handlers/order_list_flow.go`
  - admin orders 读模型
- `foos2Go/internal/handlers/mobile.go`
  - rider orders / rider status / public update_status 读写入口

---

## 4. 当前最容易误导后续修改的点

### 4.1 `src/pages/api/admin/orders.ts` 已回到纯薄代理，`itemsJson` 归一已下沉到消费端
当前真实状态：
- `src/pages/api/admin/orders.ts` 只透传上游响应，不再修补 `itemsJson`
- admin 读取侧统一在消费端归一：
  - `src/pages/admin/[slug]/index.astro`
  - `src/scripts/admin/orders.ts`
  - `src/components/admin/TabTables.astro`
- 这意味着以后如果 `itemsJson` contract 再变化，应优先改真正消费它的层，而不是把兼容逻辑重新塞回代理层

### 4.2 `src/pages/api/rider/action.ts` 与 `src/pages/api/telegram/rider-claim.ts` 平行重复
两边都在做：
- 读 order snapshot/detail
- 调 `resolveRiderOrderAction(...)`
- 生成 `remarksJson`
- 调 update_status
- 成功后 edit Telegram 原消息

如果后续继续双改，很容易再次出现：
- Telegram 修好了，dashboard 没修
- dashboard 修好了，Telegram 漏掉某个状态分支

### 4.3 `src/pages/api/admin/rider-assign.ts` 与 `src/pages/api/admin/rider-dispatch.ts` 的 Telegram 发送与 `telegramMessageRef` 回写重复
两边都在做：
- 发送 `/api/telegram/send`
- 解析 `message_id`
- fallback retry
- 重新拉最新评论
- 回写 `telegramMessageRef`

这是最适合先收敛的一组重复。

### 4.4 `src/lib/telegram-dispatch.ts` 里 legacy builder 命名会误导
当前存在旧别名函数，字面语义与真实阶段语义不一致，容易让后续人误改到旧包装而不是新 builder。

### 4.5 导航字段不要在 Telegram / 页面层重新猜
当前真实 contract：
- 后端读模型输出 `restaurantAddress` 与 `shopMapUrl`
- 前端统一由 `src/lib/rider-dispatch.ts` 的 `buildRiderOrderView(...)` / `buildRiderOrderMapUrl(...)` 产出：
  - `shopMapUrl`
  - `deliveryMapUrl`
- `shopMapUrl` 缺失时，取餐导航只允许从 `shopAddress || restaurantAddress` 回退
- `deliveryMapUrl` 缺失时，送餐导航只允许从 `tableInfo || deliveryAddress` 回退
- `tableInfo` 回退前必须先清洗掉姓名、电话、货到付款、备注尾巴；不要在 Telegram builder 或页面脚本里重复写一套清洗

如果后续再出现“地图按钮不对 / 地址被污染 / 取餐导航丢失”，优先检查：
1. 后端有没有返回 `restaurantAddress` / `shopMapUrl`
2. `buildRiderOrderView(...)` 的入参是不是走到了共享字段
3. Telegram / dashboard 是否只是消费共享 view，而不是自己重新拼 URL

### 4.5 后端 shops enrich 重复逻辑会继续制造字段不一致
以下两处目前都维护着类似的 shops join + 地址/地图回退逻辑：
- `foos2Go/internal/handlers/order_list_flow.go`
- `foos2Go/internal/handlers/mobile.go`

当前已经确认的精确重复点：
- 两边都 `LEFT JOIN shops s ON s.id = o.shop_id`
- 两边都从 `s.name` 取 `shop_name`
- 两边都用同一段 `COALESCE(NULLIF(TRIM(...)))` 从 `s.address` / `s.settings.contact.address` / `s.settings.address` 回退 `restaurant_address`
- 两边都用同一段 `COALESCE(NULLIF(TRIM(...)))` 从 `s.settings.contact.mapUrl` / `contact.map_url` / `mapUrl` / `map_url` 回退 `shop_map_url`
- 两边最终都走 `toOrderDTOWithShopName(order.Order, ..., restaurantAddress, shopMapURL)` 输出 DTO

当前差异只剩：
- `order_list_flow.go` 额外还映射 `restaurant_name`
- admin orders 的筛选条件是 `shop_id + optional status`
- rider orders 的筛选条件是“可抢单 or 当前骑手已接单”

所以阶段 3A 的最小收敛点不该是合并整个查询函数，而应该是先抽共享 SQL 片段/scan 结构：
- 共享 `SELECT` enrich 片段（`shop_name` / `restaurant_address` / `shop_map_url`）
- 共享 row enrich struct
- 保留各自 `WHERE / ORDER / LIMIT`，避免把 admin/rider 业务筛选混在一起

如果不收敛，后续仍可能出现：
- admin orders 有 `shopMapUrl`，rider orders 没有
- 或 rider orders 修了，admin orders 忘了修

### 4.6 `update_status` 同名但 contract 不完全一致
- admin 侧 status 更新能力更宽
- public `/api/order/update_status/:id` 更窄

当前已经确认的边界：
- `src/pages/api/order/update_status.ts` 是 public 薄代理，只负责：
  - 从 route/body 归一 `id`，且 route `id` 优先于 body `id`
  - 把正整数字符串 `id` 转成 number
  - 透传 `cookie` / `authorization`
  - 保留未知字段原样透传，不解释 admin 扩展语义
  - 在入口层返回 `invalid_json`、`order_id_required`
- `src/pages/api/admin/orders/[id]/status.ts` 是 admin 薄代理，只负责：
  - 校验 `params.id`
  - 原样透传请求 body
  - 透传 admin 鉴权（header 或 `admin_token` cookie）
  - 保持上游 `PUT /api/admin/orders/:id/status` 语义

所以后续不能把 public route 的入参校验/归一逻辑直接搬到 admin route，也不能把 admin 扩展字段能力误认为 public route 已支持。

---

## 5. 推荐清理顺序

### 阶段 0：先冻结事实，不先大改
1. 补这份总结文档
2. 确认并保留现有关键回归测试：
   - `src/lib/admin-rider-dispatch-route-spec.ts`
   - `src/lib/rider-action-route-spec.ts`
   - `src/lib/telegram-rider-claim-route-spec.ts`
   - `src/lib/rider-dispatch-spec.ts`
   - `src/lib/telegram-dispatch-spec.ts`
   - `src/lib/order-update-status-route-spec.ts`

### 阶段 1：先做前端代理层内部去重，不改外部 contract
1. 收敛 admin 侧 Telegram 发送与 `telegramMessageRef` 回写重复
2. 收敛 rider dashboard 与 Telegram callback 的共同动作执行器
3. 清理 legacy Telegram builder 命名与无效包装

### 阶段 2：单独对齐 `update_status` contract
先把文档和测试写清，再决定保留双入口还是逐步收敛到同一 contract。

### 阶段 3：统一后端读模型，并把前端 compat 责任收口到消费端
1. 收敛后端 shops enrich 重复 SQL/映射
2. `src/pages/api/admin/orders.ts` 的代理修补已删除；当前要求是保持代理层纯透传，`itemsJson` 兼容只留在真实消费端

---

## 6. 本轮首批建议删除/收敛的对象

### 可以优先删或收敛
- `src/lib/telegram-dispatch.ts` 中只用于历史兼容、且生产代码不再依赖的 legacy builder 包装
- admin assign / dispatch 内部重复的 Telegram send + `telegramMessageRef` 解析/回写分支
- rider action / telegram claim 内部重复的“读详情 + 推状态 + edit 原消息”分支

### 当前仍需谨慎处理
- `readOrderDetail()` 的 admin orders → rider orders fallback
- 各 admin 消费端里仍保留的 array/object 双形态兜底解析

前者仍在承担线上止血作用；后者虽然已从代理层移除，但在真实消费端还保留兼容，后续若要进一步收窄，必须继续以测试先行。

---

## 7. 验证要求

### 自动化
前端优先跑：
- `node --test src/lib/admin-rider-dispatch-route-spec.ts`
- `node --test src/lib/rider-action-route-spec.ts`
- `node --test src/lib/telegram-rider-claim-route-spec.ts`
- `node --test src/lib/rider-dispatch-spec.ts`
- `node --test src/lib/telegram-dispatch-spec.ts`
- `node --test src/lib/order-update-status-route-spec.ts`

后端优先跑：
- `go test ./internal/handlers/...`

### 手工 smoke
1. admin publish 一个 `awaiting_courier` 订单
2. Telegram 接单
3. rider dashboard 查看同一订单状态
4. rider 标记 `picked_up`
5. Telegram 原消息被 edit，而不是补发第二条
6. rider 标记 `complete`
7. admin orders 与 rider orders 都仍有 `shopName` / 地址 / map

---

## 8. 结论

这条链路现在最重要的不是“继续补更多兼容 if”，而是：
1. 先把接口和事实源写清楚
2. 先收敛前端代理层内部重复
3. 再单独处理状态 contract 对齐
4. 最后才删兼容层

后续每次改 dispatch / Telegram / rider / admin 时，都先从这份文档对应的共享事实源开始，不要直接在页面脚本或单个 route 里凭感觉补逻辑。