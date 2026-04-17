# 2026-04-09 后端单线路与订单 API 真源设计

> 状态说明（部分过期）：这份设计里关于“移除 foos2Go Go 测试文件”和“删除所有运行时测试入口”的内容，属于当时的阶段性主张，不代表当前代码库的真实目标状态。
> 继续处理后端订单 contract 时，应以已经落地的 DTO / enrich / route 共享事实源为准，尤其是：`foos2Go/internal/handlers/order_dto.go`、`order_shop_enrich.go`、`order_list_flow.go`、`mobile.go`，以及前端总文档 `docs/superpowers/specs/2026-04-15-dispatch-telegram-rider-admin-cleanup-design.md`。

## 1. 背景
当前两类问题已经暴露出同一个根因：**后端对外契约不是单一真源，前端又在多处自行猜字段、补兼容、绕开正式链路**。

### 已确认的两个直接故障
1. 买家下单后看不到自己的订单。  
   根因不是“没有订单”，而是 `foos2Go/internal/handlers/mobile.go` 的 `UserHistory` 直接返回 `db.Order`，JSON 仍是 `order_type`、`created_at`、`courier_phone` 这类 snake_case；而 `food2astro/src/pages/orders/index.astro` 只按 `order.orderType`、`order.createdAt` 等 camelCase 读取，结果前端把真实订单全过滤掉了。

2. Telegram 点击“已取餐”后，admin 视觉上像“已送达”。  
   根因不是单点按钮文案错，而是多端对配送阶段的判断和展示没有完全绑定到一套后端输出语义；页面、消息按钮、状态文案、动作命名仍有分叉空间。

### 更深一层的问题
- Go 后端大量直接把数据库模型当 HTTP JSON 输出；
- 数据库字段是 snake_case，但前端主线已在向 camelCase 迁移；
- Astro BFF 和页面里留有多处“猜上游返回形状”的兼容代码；
- 仓库里仍残留测试/诊断/临时入口，导致真实生产线被额外分叉；
- 当时文档将 foos2Go 中的 Go 测试文件视为待移除对象；这属于阶段性背景，不应再直接当作当前目标状态。

用户已明确选定本轮方向：
- 选 **后端统一单一真源**；
- **数据库内部可以保留 snake_case**，但 **HTTP 对外一律 camelCase**；
- **当时主张移除 foos2Go 里的 Go 测试文件**；
- **删除 test/debug 运行时入口和 UI**；
- 只保留一条真实生产链路，不再长期共存“测试线/正式线/兼容线”。

---

## 2. 目标

### 2.1 主目标
1. `foos2Go` 对外 HTTP JSON 统一为 camelCase。
2. 后端成为唯一接口真源，前端不再承担字段翻译责任。
3. `orders` / `user history` / `rider orders` / `public order` / `admin orders` 等订单相关链路统一契约。
4. 删除运行时 test/debug 入口，只保留生产语义路由。
5. 当时曾主张删除 `foos2Go` 下全部 Go 测试文件，作为收口动作的一部分。
6. 修复这次实际暴露出的两类故障：买家订单消失、配送状态展示错位。

### 2.2 次目标
1. 前端页面和 BFF 只消费 camelCase，不再混读 snake_case。
2. 删除临时诊断文案、测试按钮、测试 API，避免继续污染真实链路。
3. 为后续所有订单相关改动建立明确边界：**DB 模型 ≠ 对外 API 合同**。

---

## 3. 非目标
1. 不保留 snake_case + camelCase 双轨对外输出。
2. 不新增版本号路由或第二套“新 API”。直接在现有正式路由上收口。
3. 不保留 `/telegram-test`、`rider-telegram-test`、运行时诊断展示这类测试/调试入口作为长期能力。
4. 不重做数据库 schema。
5. 不为了这轮收口去重构无关业务模块。
6. 不把“前端兼容层”继续做大做厚；本轮目标是删兼容，不是再造兼容。

---

## 4. 核心决策

### 4.1 后端单一真源：DB 模型只留在后端内部
`foos2Go/internal/db/models.go` 中的 `db.Order`、`db.User`、`db.Rider` 继续承担数据库扫描职责，但**不再直接作为 HTTP 返回体**。

也就是说：
- `db.Order.OrderType` 对应数据库列 `order_type` 可以继续存在；
- 但 HTTP 返回体必须是 `orderType`；
- `db.Order.CreatedAt` 对外必须是 `createdAt`；
- `db.Rider.TelegramChatID` 对外必须是 `telegramChatId`；
- 同理所有订单/用户/骑手公开字段都遵守 camelCase。

### 4.2 对外合同统一 camelCase，不做双轨兼容
最终口径：
- 数据库层：snake_case 列名；
- Go 代码内部：现有字段名可维持；
- HTTP JSON：camelCase；
- Astro 页面 / islands / scripts / BFF：只读 camelCase。

本轮不接受这些做法：
- 同时输出 `order_type` 和 `orderType`；
- 前端继续写 `order.orderType || order.order_type`；
- 后端继续直接把 `db.Order` 原样吐出去，再让前端修补。

### 4.3 运行时只保留生产入口
测试、诊断、临时排障入口本轮全部清掉。尤其是：
- `foos2Go/internal/handlers/master_routes.go` 里的 `POST /api/master/telegram-test`；
- `food2astro/src/scripts/master/settings-forms.ts` 里的“发送测试消息”链路；
- `food2astro/src/scripts/admin/settings-ui.ts` 里的骑手 Telegram 测试链路；
- 页面内只给排障看的错误细节/诊断文字；
- 其他只为验证、测试、临时联调用的运行时逻辑。

后续若需要验证生产能力，直接走真实生产接口和真实生产动作，不再额外保留“测试版入口”。

### 4.4 关于移除 foos2Go Go 测试文件（历史主张）
这部分记录的是当时希望把 foos2Go 下 Go 测试文件一并清掉的阶段性主张。
继续参考这份设计时，应把它理解为历史背景，而不是当前仓库必须满足的硬性验收条件。

这不是“后面再说”的清理项，而是本轮架构收口的一部分。

---

## 5. 目标架构

### 5.1 后端输出分层
采用最小必要分层：

1. **数据库模型层**  
   继续使用 `internal/db/models.go` 中的结构体做扫描。

2. **HTTP DTO 层**  
   新增最小共享 DTO / mapper，把数据库模型投影为稳定对外合同。  
   建议放在 `foos2Go/internal/handlers` 下，避免再起新目录层级；可按实体拆成极小文件，例如：
   - `order_dto.go`
   - `user_dto.go`
   - `rider_dto.go`

3. **handler 层**  
   各 handler 查询后统一先转 DTO，再返回 JSON。

原则：**只增加一层明确边界，不做过度抽象。**

### 5.2 订单 DTO 作为第一优先级真源
订单相关故障最多，因此先把订单 DTO 固化。对外统一字段至少包括：
- `id`
- `orderNo`
- `shopId`
- `restaurantId`
- `tableInfo`
- `orderType`
- `status`
- `printStatus`
- `totalAmount`
- `itemsJson`
- `originalItems`
- `originalItemsJson`
- `remarksJson`
- `userPhone`
- `scheduledFor`
- `createdAt`
- `updatedAt`
- `courierPhone`
- `courierName`
- `pickupEtaMinutes`
- `pickupReadyAt`
- `riderBroadcastedAt`
- `riderLastRemindedAt`
- `riderRemindCount`
- `dispatchStatus`
- `dispatchRound`
- `currentPoolIndex`
- `lastDispatchedRiderId`
- `nextEscalateAt`
- `escalationCount`
- `archived`
- `archivedAt`
- `paidAt`
- `isDeleted`
- `deletedAt`
- `modificationCount`
- `deliveryFeeStatus`
- `allowAdd`
- `deliveryInfo`

允许省略值为空的字段，但**字段命名不能再回退为 snake_case**。

### 5.3 用户与骑手 DTO 也同步收口
与订单相关的用户、骑手返回体同样遵守 camelCase：
- `loginAccount`
- `lastAddress`
- `telegramChatId`
- 其他已经自然 camelCase 的字段保持不变。

目标不是只修一个 `orderType`，而是彻底切断“数据库命名直接泄露到 HTTP”的路径。

---

## 6. 关键后端落点

### 6.1 第一批必须收口的 handler
1. `foos2Go/internal/handlers/mobile.go`
   - `RiderOrders`
   - `UserHistory`
   - `PublicOrderStatus`
   - `PublicOrdersByTable`

2. 订单正式更新与列表链路
   - `OrderUpdateStatus` 所在链路保持正式语义，不加 test/debug 旁路；
   - admin orders 对外回包若仍直接或间接暴露数据库形状，也一并改到 DTO。

3. 其他实际被前端生产链路消费的订单接口
   - 只要返回 order / rider / user 形状，就纳入统一 DTO。

### 6.2 保持不动的部分
- 数据库列名和 SQL 本身不要求改名；
- 只要查询结果在 handler 层能投影成统一 DTO，就不强求改底层表结构。

这样可以用最小改动收口真源，同时不制造额外 DB 风险。

---

## 7. 关键前端落点

### 7.1 BFF / API route
以下前端 API 路由要从“兼容修补层”收口成“轻转发层”：
- `src/pages/api/rider/orders.ts`
- `src/pages/api/order/update_status.ts`
- `src/pages/api/telegram/rider-claim.ts`
- `src/pages/api/admin/orders.ts`
- 以及其他订单相关 BFF

原则：
- 保留必要的鉴权透传、错误转发、请求参数整理；
- 删除字段形状修补、snake_case -> camelCase 猜测性兼容；
- 不再把上游不规范输出藏在 BFF 里偷偷修。

### 7.2 直接消费订单的页面与组件
以下入口只读 camelCase：
- `src/pages/orders/index.astro`
- `src/pages/rider/dashboard.astro`
- `src/components/UserModal.tsx`
- `src/components/UserCenterPageIsland.tsx`
- `src/components/ShopChatModal.tsx`
- 以及 admin/rider/buyer 里所有直接读订单字段的脚本与 islands

尤其是：
- `order.orderType`
- `order.createdAt`
- `order.courierPhone`
- `order.remarksJson`

前端不再写任何 `snake_case fallback`。

### 7.3 配送状态展示也绑定到同一正式字段口径
本轮不是单独做一个“已取餐 UI patch”，而是要让 admin / rider / Telegram / buyer 全部继续复用共享状态 helper，且这些 helper 读取的订单字段都来自同一份 camelCase 正式合同。

这样 Telegram 点击“已取餐”后的页面展示才不会再因为某个入口读了旧字段或本地判断分叉而错位。

---

## 8. 删除范围

### 8.1 后端运行时入口删除
应删除的生产外测试入口包括：
- `POST /api/master/telegram-test`
- 其他仅用于测试消息、诊断消息、联调验证的运行时 route
- 仅服务于这些 route 的 handler 与辅助逻辑

### 8.2 前端 UI / 脚本删除
应删除：
- master 配置页的 Telegram 测试按钮与调用链；
- admin 骑手 Telegram 测试按钮与调用链；
- 页面里直接暴露给用户的诊断详情、debug 文本、临时错误展开；
- 其他仅为测试而保留的按钮、文案、脚本分支。

### 8.3 Go 测试文件删除
应删除：
- 历史方案中曾把 `foos2Go/**/*.go` 下所有 Go 测试文件列为删除对象。

### 8.4 不在本轮删除范围内
以下不作为本轮目标：
- 框架自身开发模式开关；
- 与当前订单/Telegram/历史链路无关的普通日志；
- 数据库迁移脚本。

也就是说，本轮删除的是**应用层 test/debug 分叉**，不是把整个开发环境概念抹掉。

---

## 9. 实施顺序

### 阶段 1：固化后端 DTO 真源
1. 找出所有生产链路实际返回 `db.Order` / `db.User` / `db.Rider` 的 handler；
2. 引入 DTO 和 mapper；
3. 把正式订单相关 handler 先切到 DTO 输出；
4. 同步保证 `UserHistory`、`RiderOrders`、public order 相关接口全改为 camelCase。

### 阶段 2：切前端到单合同
1. 删除页面和 BFF 中对 snake_case 的读取；
2. 收口 `/api/admin/orders` 等代理层的临时补丁；
3. 保证 orders 页、rider 页、admin 页都只看 camelCase。

### 阶段 3：删除 test/debug 运行时分叉
1. 删除后端测试路由；
2. 删除前端测试按钮与脚本；
3. 删除运行时诊断展示；
4. 确保真实生产功能仍可通过正式入口完成。

### 阶段 4：最终清理 Go 测试文件
1. 历史方案中曾要求删除 `foos2Go` 中全部 Go 测试文件；
2. 再做一次全文搜索，确认不留残余引用；
3. 最终树中不再存在 Go 测试文件。

这个顺序的目的是：**先收口真源，再删分叉，最后删测试痕迹**。这样风险最低，也不会在半路失去参考物。

---

## 10. 错误处理原则
1. 不再用“多字段 fallback”掩盖后端契约错误；
2. 任一正式接口若仍输出 snake_case，应直接修后端，不在前端补；
3. 前端失败时显示正式错误，不再显示调试专用细节块；
4. 生产线只允许一条正式动作链，不再额外保留 `test` 动作验证是否可用。

---

## 11. 风险与控制

### 风险 1：改一半时前后端暂时不一致
控制：
- 采用同一批改动同时切后端 DTO 与前端消费；
- 不做长期双轨兼容；
- 以订单历史链路为第一优先级先打通。

### 风险 2：删测试入口后失去联调手段
控制：
- 直接走正式入口做烟雾验证；
- 必要时用备份/历史版本作只读参考，不把测试入口继续留在代码里。

### 风险 3：历史方案若删除 Go 测试文件，回归手段会变少
控制：
- 在删除前先完成必要构建与正式链路验证；
- 删除动作放在收口末尾执行，避免影响中途判断。

### 风险 4：仍有遗漏接口继续吐 snake_case
控制：
- 以“返回 order/user/rider JSON 的生产 handler”为扫描单位逐个收口；
- 最终做全文搜索和人工抽样接口检查。

---

## 12. 验证方式
由于这份旧设计当时把“移除 foos2Go Go 测试文件”也纳入收口范围，所以文中验收方式更偏向**生产链路构建 + 正式接口烟雾验证 + 全文搜索**。

### 12.1 后端验证
1. 订单相关正式接口返回体只出现 camelCase；
2. `/api/user/history` 返回的订单对象可直接被前端消费；
3. `/api/rider/orders` 返回的订单对象可直接被 rider 页面消费；
4. 生产路由中不再存在 `telegram-test` 等测试入口。

### 12.2 前端验证
1. 买家下单后可在 `orders` 页面看到自己的订单；
2. rider / Telegram / admin 的配送阶段展示一致；
3. 前端源码中不再出现订单字段的 snake_case fallback；
4. 测试按钮和调试诊断 UI 已从生产页面删除。

### 12.3 清理验证
1. 历史方案中曾把“`foos2Go` 下不再存在 Go 测试文件”列为清理验证项；
2. 全文搜索不再出现运行时 `telegram-test` 入口；
3. 全文搜索不再出现订单字段双轨读取模式。

---

## 13. 验收标准
满足以下条件才算本轮完成：
1. `orders` 页面恢复正常，买家能看到自己的历史订单；
2. 配送状态在 admin / rider / Telegram / buyer 侧不再错位；
3. 订单相关正式 API 对外只输出 camelCase；
4. 前端不再承担 snake_case 到 camelCase 的补偿工作；
5. 后端运行时 test/debug 路由和前端测试按钮已删除；
6. 历史方案曾把“`foos2Go` 中所有 Go 测试文件已删除”作为验收条件之一；
7. 仓库内只剩一条真实生产链路。

---

## 14. 最终结论
本轮采用的最终方案是：

- **后端单一真源**；
- **数据库内部保留现状，对外 HTTP JSON 一律 camelCase**；
- **前端只消费 camelCase，不再猜字段**；
- **删除运行时 test/debug 分叉**；
- **曾把移除 foos2Go Go 测试文件作为阶段性收口目标**；
- **用同一条正式生产链路修复订单历史消失与配送状态错位问题**。

这套方案不是再补一个局部兼容，而是把“数据库模型直出 + 前端到处补洞 + 测试入口长期共存”的旧模式彻底收掉。