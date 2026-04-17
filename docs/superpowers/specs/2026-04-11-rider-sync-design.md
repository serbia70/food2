# 2026-04-11 骑手三端统一动作与同步设计

> 状态说明（已过期）：这份设计是中间方案，里面“新增 rider web 专用 action route”“Telegram 发送第二条阶段消息（历史方案）推进阶段”等决策已被后续实现否定。
> 当前应以 `docs/superpowers/specs/2026-04-15-dispatch-telegram-rider-admin-cleanup-design.md` 与 `src/lib/rider-dispatch.ts` / `src/lib/telegram-dispatch.ts` 为准：
> - rider dashboard 继续走现有 `src/pages/api/rider/action.ts`
> - Telegram 对单订单保留单条可编辑消息，不再以发送第二条阶段消息（历史方案）作为当前规则
> - 导航、状态词、动作词都从共享 helper 输出，页面与消息层不再各自猜

## 背景
当前骑手侧同时存在三个会影响配送状态的面：
- admin 派单与改派；
- Telegram 骑手消息；
- rider dashboard 网页。

最近线上问题已经证明，三端如果各自维护一套动作语义，就会快速失真：
- Telegram 的 `accept / decline` 与 `picked_up / complete` 原本混用了同一套 callback 过期语义；
- rider dashboard 直接调用薄代理 `src/pages/api/order/update_status.ts`，并在前端自己拼接部分派单语义；
- 真实订单里存在 `remarksJson` 缺失但 `courierPhone` 已绑定的配送中订单，导致“旧规则认为已改派，真实业务却仍属于当前骑手”的误判。

现状已经明确：
- Telegram 是骑手主入口；
- rider dashboard 是辅助查看与补充操作界面，不应该发明第二套动作规则；
- 三端必须以服务端订单真相同步，而不是以某一条消息或某一页前端状态为准。

## 目标
本轮设计只解决以下问题：
1. 统一骑手四个动作的服务端判定：`accept`、`decline`、`picked_up`、`complete`；
2. 让 Telegram、rider dashboard、admin 三端围绕同一套订单状态真相同步；
3. rider dashboard 重做为“总览优先”的辅助工作台，支持滚动、摘要、店铺分布与统一动作；
4. 店铺名、店铺地图、客户导航等骑手关键信息改成共享展示模型输出；
5. 删除已经被共享动作层覆盖的重复判断和前端猜测逻辑，减少后续修改时的猜代码成本；
6. 将本轮规则固化成文档，后续修改直接围绕文档与共享核心推进。

## 非目标
本轮不扩散到以下内容：
- 不新增新的配送业务状态；
- 不重做 Telegram 复杂消息编辑系统；
- 不引入新的实时基础设施（例如单独 WebSocket/事件总线系统）替代当前可用链路；
- 不顺手重构无关 admin/master 功能；
- 不做大规模样式重构，只收 rider dashboard 与相关骑手展示面。

## 统一状态真相
### 1. 真相来源
骑手动作是否合法，只看服务端订单真相：
- `status`
- `dispatch_meta`
- `courierPhone`
- 当前骑手身份（`riderId / riderPhone / telegramChatId` 解析结果）

其中：
- `dispatch_meta` 仍然是待接单阶段和改派链路的主判定来源；
- 当订单已进入配送阶段且 `dispatch_meta` 缺失时，允许使用 `courierPhone` 作为当前骑手归属兜底；
- Telegram 消息寿命、网页本地缓存、旧按钮文案都不是业务真相。

### 2. 状态与动作
统一围绕现有四态：
- `awaiting_courier`
- `delivering`
- `picked_up`
- `completed`

统一四个动作：
- `accept`: `awaiting_courier -> delivering`
- `decline`: 保持 `awaiting_courier`，写回拒单决策与改派上下文
- `picked_up`: `delivering -> picked_up`
- `complete`: `picked_up -> completed`

### 3. 各动作判定规则
#### accept / decline
- 只在 `awaiting_courier` 阶段可执行；
- 受当前派单轮 `dispatch_meta.currentExpiresAt` 约束；
- 旧轮次按钮必须失效；
- 失败语义统一为：`expired_callback` / `dispatch_invalidated` / `order_status_updated`。

#### picked_up / complete
- 不再受 Telegram callback TTL 的硬过期拦截；
- 只看订单真实状态是否允许推进；
- 再看当前骑手是否仍然拥有该单；
- 若 `dispatch_meta` 缺失，但当前订单 `courierPhone` 与当前骑手匹配，则允许配送阶段继续推进；
- 失败语义统一为：`order_status_updated` / `order_completed` / `dispatch_invalidated`。

## 共享动作核心设计
### 1. 核心职责
将“动作是否允许、失败原因是什么、状态要如何推进、remarks 要如何写回”收口到共享服务端逻辑，避免：
- Telegram handler 各写一套；
- rider dashboard 页面脚本各写一套；
- admin 侧再猜一套。

### 2. 输入输出
共享动作核心输入：
- 订单快照：`status`、`remarksJson`、`courierPhone`、必要的订单基础字段；
- 当前骑手身份：`riderId`、`riderPhone`、`riderName`、`telegramChatId`；
- 动作类型：`accept | decline | picked_up | complete`；
- 当前时间。

共享动作核心输出：
- `allowed`
- `error`
- `reason`
- `targetStatus`
- `expectedCurrentStatus`
- `nextRemarksJson` 或 remarks patch
- 是否需要发送后续同步消息

### 3. 代码边界
优先在 `src/lib/rider-dispatch.ts` 基础上扩展，不额外做重量级抽象。
只有在明确能减少重复时，才新增一个很薄的 shared action helper。

目标边界：
- `src/lib/rider-dispatch.ts`：动作判定与归属语义核心；
- `src/pages/api/telegram/rider-claim.ts`：Telegram 适配层；
- 新增 rider web action route：网页适配层；
- `src/pages/api/order/update_status.ts`：继续保持底层透传，不承载骑手业务语义。

## 双入口适配策略
### 1. Telegram
`src/pages/api/telegram/rider-claim.ts` 继续保留，但只做 Telegram 专属事情：
- 解析 callback；
- 校验 Telegram 身份与签名；
- 调用共享动作核心；
- 根据动作结果补发 Telegram 新消息；
- 映射统一业务错误到 Telegram 文案。

Telegram 不再承担额外的独占业务逻辑，避免它和网页动作分叉。

### 2. rider dashboard
新增一个 rider web 专用 action route，职责只有：
- 读取当前 rider session / phone / identity；
- 调用同一套共享动作核心；
- 返回网页可直接消费的统一结果；
- 成功后触发页面刷新与同步收敛。

rider dashboard 不再：
- 直接调用薄代理 `update_status` 承载四个骑手动作；
- 在前端自行构建 decline 用的 `remarksJson`；
- 在页面脚本里重复判断“是否可点 / 是否已改派 / 是否超时”。

### 3. admin
admin 继续负责派单、改派、订单总览与当前状态呈现。
admin 不需要和 Telegram/rider web 共用同一个外部接口，但必须共享：
- 同一套主状态文案；
- 同一套订单归属真相；
- 同一套改派失效语义。

## 三端同步策略
### 1. 同步原则
不强行把三端做成同一个接口，而是统一为：
- 服务端订单状态是唯一真相；
- 任一端动作成功后，其余两端尽快收敛到相同状态；
- Telegram 历史消息只是操作入口，不是长期真相载体。

### 2. 成功后的同步动作
当任一端动作成功：
- admin 当前订单列表立即刷新；
- rider dashboard 当前订单列表立即刷新；
- Telegram 在当时方案中按阶段追加一条历史消息；当前规则已改为单条可编辑消息。

同时保留短轮询兜底，防止：
- 页面长时间停留；
- Telegram 之外的状态变化未立刻可见；
- 某个入口的本地 UI 未及时重绘。

### 3. Telegram 历史阶段消息方案（已被后续实现替代）
这里记录的是当时采用“发送第二条阶段消息”的中间方案，不代表当前规则：
- 派单/改派/自动续派：发新的待接单消息，带 `accept / decline`；
- 接单成功：发新的已接单消息，带 `picked_up`；
- 已取餐成功：发新的配送中消息，带 `complete`；
- 已送达成功：发完成消息，不再带动作按钮。

这样处理的原因：
1. 避免强依赖旧消息编辑成功；
2. 让骑手始终看到当前阶段唯一该做的动作；
3. 旧按钮点击时更容易返回明确的失效原因，而不是消息状态混乱。

### 4. 旧按钮失效语义
旧按钮点击后，统一返回真实业务原因：
- `expired_callback`
- `dispatch_invalidated`
- `order_status_updated`
- `order_completed`

Telegram 和 rider dashboard 都不再用模糊的“超时了”掩盖真实原因。

## rider dashboard 信息与 UI 设计
### 1. 产品定位
rider dashboard 的定位从“另一套独立动作面”收回为：
- 统一状态总览；
- 辅助执行动作；
- 查看自己手上有多少单、来自哪些店、目前进行到哪一步。

Telegram 仍是骑手主入口；
rider dashboard 的价值是“看得更全、看得更清楚、必要时可补充操作”。

### 2. 页面结构
页面改为三段式：
1. 顶部固定摘要区
   - 进行中订单数
   - 今日已完成数
   - 涉及店铺数
   - 店铺分布摘要
2. 中部切换区
   - 可接单
   - 我的配送
   - 今日完成
3. 下方独立滚动列表
   - 整页占满视口
   - 只让订单列表区滚动
   - 避免当前页面无法顺畅下滑查看后续订单的问题

### 3. 卡片字段
活跃卡片统一展示：
- 店铺名称
- 店铺地址
- 到店地图按钮
- 客户地址
- 送达导航按钮
- 当前状态标签
- 骑手信息
- 金额
- 预计取餐时间 / 配送相关时间
- 当前允许动作

### 4. 按钮层级
统一遵循：
- 每张卡片只有一个主按钮；
- 其余为次按钮；
- 不同时出现两个强主动作。

对应关系：
- 待接单卡片：主按钮 `接单`，次按钮 `暂不接单`；
- 我的配送（delivering）：主按钮 `已取餐`；
- 我的配送（picked_up）：主按钮 `已送达`；
- 联系/导航类为次按钮。

### 5. 可滚动与可扫描
样式目标不是花哨，而是：
- 白底卡片、层级清晰；
- 状态标签明确；
- 摘要与列表区职责分明；
- 长列表下滑稳定；
- 一眼能看出“我有几单、哪几家店、每单当前到哪一步”。

## 共享展示模型与地图信息
### 1. 共享字段
骑手侧展示字段统一从共享 helper 输出，不再各端自己拼：
- `shopName`
- `shopAddress`
- `shopMapUrl`
- `deliveryAddress`
- `deliveryMapUrl`
- `orderStatus`
- `courierName`
- `courierPhone`
- `totalAmount`
- `pickupEtaMinutes`

### 2. 三端要求
#### rider dashboard
必须显示：
- 店铺名称
- 到店地图
- 客户地址
- 送达导航

#### Telegram
必须补上：
- 店铺名称
- 店铺地图链接
- 客户导航链接

#### admin / 首页地图入口
店铺页与首页涉及地图跳转的入口，统一走同一份地图链接来源，避免一边能打开、一边不能打开。

### 3. 设计原则
所有地图与店铺文案都从共享展示模型取值。
未来改地图生成规则时，只改一处，不再在 Telegram、rider dashboard、admin 卡片里分别排查。

## 失败语义统一
统一保留以下业务错误：
- `expired_callback`：只用于接单/拒单阶段的回调过期；
- `dispatch_invalidated`：当前派单已失效、订单已改派、当前骑手不再有效；
- `order_status_updated`：订单已被别端推进；
- `order_completed`：订单已完成。

映射原则：
- Telegram 文案直接表达真实业务原因；
- rider dashboard 也展示相同业务原因，并立即刷新当前列表；
- 不再把配送推进失败统一说成“超时”。

## 清理范围
本轮允许删除的内容只限与骑手动作链路直接相关的重复/无效代码：
- rider dashboard 前端手写的四套状态推进逻辑；
- rider dashboard 前端手拼 decline `remarksJson` 的逻辑；
- 已被共享动作核心替代的重复状态判断；
- 各端各自拼店铺名/地图/地址文案的重复代码；
- 已确认无用、会增加误判成本的旧分支。

保留：
- Telegram callback 专属校验；
- `dispatch_meta + courierPhone` 双判定语义；
- 已证明有价值的回归测试。

## 验证边界
上线前只验证主链路：
1. admin 派单 -> Telegram 收到待接单 -> rider dashboard 同步出现；
2. Telegram 接单 -> admin / rider dashboard 同步进入我的配送；
3. Telegram 已取餐 -> admin / rider dashboard 同步进入 `picked_up`；
4. rider dashboard 已送达 -> admin / Telegram 同步完成；
5. 改派 / 自动续派后，旧按钮统一失效并提示真实业务原因；
6. 无 `dispatch_meta`、仅 `courierPhone` 的配送中订单仍可继续推进；
7. rider dashboard 可顺畅滚动并清晰展示订单摘要与店铺分布；
8. rider dashboard 与 Telegram 都能看到店铺名与地图入口。

## 变更归档要点
本轮需要额外归档的不是代码清单，而是关键决策：
1. 根因：线上存在 `remarksJson` 缺失但 `courierPhone` 已绑定的真实配送订单，旧逻辑因此误判“已改派”；
2. 结论：`src/pages/api/order/update_status.ts` 只是薄代理，不适合作为骑手业务语义接口；
3. 决策：Telegram 继续为主入口，rider dashboard 退回辅助总览面；
4. 决策：三端共享动作判定，Telegram 用发送第二条阶段消息（历史方案）推进阶段；
5. 清理原则：删除已被共享动作层覆盖的前端猜测代码，避免以后修改继续靠猜。

## 最终结论
本轮最终采用以下设计：
- 服务端订单状态、`dispatch_meta` 与 `courierPhone` 共同构成骑手动作真相；
- `accept / decline / picked_up / complete` 四个动作共享同一套服务端判定；
- Telegram 与 rider dashboard 不必强行共用同一个外部接口，但必须共用同一个动作核心；
- Telegram 作为主入口，采用发送第二条阶段消息（历史方案）同步阶段；
- rider dashboard 改为可滚动、可总览、字段统一的辅助工作台；
- 地图、店铺名、配送地址等骑手关键字段全部从共享展示模型输出；
- 清理已失效的前端猜测逻辑后，后续修改只需围绕共享核心与薄适配层推进，不再满项目猜代码。
