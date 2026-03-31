# Master 骑手状态看板设计

## 背景
当前 `master` 已有店铺管理、经营总览、全局设置、调度总览与备份管理，但还缺一个专门面向平台运力的骑手状态看板。用户希望在一个位置看到全部平台骑手的状态，如空闲、送餐中、下班，以及每个骑手当前接了哪些订单、哪些订单需要代收餐费、哪些不需要代收、每单配送费是多少等。

与此同时，用户明确限定了边界：商家配送场景允许商家维护自定义骑手（例如老板自己配送），这类骑手只需要姓名和电话，不强制绑定 Telegram；但它们不应进入 `master` 的统一骑手管理，也不应计入 `master` 的平台骑手统计。

## 目标
新增一个 `master` 层面的“骑手状态”tab，用于集中查看平台骑手的实时状态与当前订单负载，优先满足以下问题：

- 当前有多少平台骑手空闲、送餐中、下班。
- 每个骑手当前在送哪些单。
- 哪些订单需要代收餐费、代收多少钱。
- 每个骑手当前配送费总额与代收总额是多少。
- 首屏能快速扫运力，不把页面做成杂乱的全量订单详情页。

## 非目标
第一版明确不做以下内容：

- 不在 `master` 里管理商家自定义骑手。
- 不在 `master` 里统计商家自定义骑手。
- 不做地图、轨迹或位置分布。
- 不做复杂筛选器、导出、对账报表。
- 不把 Telegram 绑定管理入口塞进该 tab。
- 不默认铺开今日所有已完成订单。

## 页面结构
在现有 `master` tab 体系中新增一个 `riders` tab，显示名为“骑手状态”。

为了避免继续把代码堆进大文件，页面入口只保留最小挂载；新的骑手状态展示必须拆到独立组件与独立 helper 中实现，而不是继续往 `src/pages/master/index.astro` 塞大段渲染和业务逻辑。

### 顶部总览条
首屏顶部展示平台骑手与当前运力汇总：

- 平台骑手总人数
- 空闲人数
- 送餐中人数
- 下班人数
- 当前进行中订单总数
- 当前代收订单总数
- 当前配送费总额
- 当前代收总额

这部分用于一眼看整体运力与收款风险，不承载明细操作。

### 三栏骑手看板
总览条下方按状态分为三栏：

- 空闲
- 送餐中
- 下班

每栏中展示对应状态的骑手卡片。

### 骑手卡默认信息
每张骑手卡默认折叠，摘要区只展示核心字段：

- 骑手姓名
- 电话
- 当前状态
- 当前进行中订单数
- 代收订单数
- 代收总额
- 配送费总额

### 骑手卡展开区
点击骑手卡后展开订单区。第一版默认只展示该骑手名下的进行中订单，已完成订单不抢占首屏，可在第二阶段以折叠区补充“今日已完成”。

进行中订单按接单时间从早到晚排序，方便看压单与超时。

每笔订单展示：

- 订单号
- 店铺名
- 当前状态
- 是否代收
- 订单金额
- 配送费
- 接单时间
- 完成时间（如有）
- 代收金额

## 数据边界
该看板只纳入平台骑手，不混入商家自定义骑手。

- 平台骑手：进入 `master` 统一看板与统计。
- 商家自定义骑手：只保留在商家配送侧维护，不进入 `master`。

这样可以避免把“平台调度能力”和“商家自配送人员”混成一套总控视图。

## 后端接口设计
建议由后端新增一个专用聚合接口 `/api/master/riders`，由后端完成平台骑手与订单、费用字段的一次性聚合，前端只做展示。

`food2astro` 新增薄代理：

- `src/pages/api/master/riders.ts`

职责保持和现有 `dispatch` 代理一致：

- 校验 master 鉴权
- 转发到上游 `/api/master/riders`
- 透传状态码与 JSON

前端不要同时请求多个接口再自行拼装骑手、订单、费用关系。

## 返回结构
建议 `/api/master/riders` 返回三层结构：

### 1. summary
用于顶部总览条：

- `total_riders`
- `available_riders`
- `busy_riders`
- `offline_riders`
- `active_order_count`
- `cod_order_count`
- `delivery_fee_total`
- `cod_amount_total`

### 2. groups
按状态分栏：

- `available`
- `busy`
- `offline`

每个字段都是骑手数组。

### 3. rider item
每个骑手包含：

- `rider_id`
- `name`
- `phone`
- `status`
- `active_order_count`
- `cod_order_count`
- `delivery_fee_total`
- `cod_amount_total`
- `orders`

### 4. order item
每个订单包含：

- `order_id`
- `order_no`
- `shop_id`
- `shop_name`
- `status`
- `accepted_at`
- `completed_at`
- `is_cash_on_delivery`
- `order_amount`
- `delivery_fee`
- `cash_to_collect`

## 字段口径
### 骑手状态
继续沿用现有平台骑手状态枚举：

- `available`
- `busy`
- `offline`

前端只做文案映射：

- `available` → 空闲
- `busy` → 送餐中
- `offline` → 下班

### 订单归属
第一版优先使用后端已有的稳定骑手归属字段。如果后端已经存在 `rider_id` 关系，则直接按 `rider_id` 聚合；如果当前仍以订单上的 `courier_name`、`courier_phone` 为主，则后端可先做兼容映射，但对前端统一输出稳定的 `rider_id` 结果。

### 活跃订单
第一版的活跃订单以已经明确挂到骑手名下的订单为准，重点覆盖 `delivering`，必要时兼容已指派但尚未正式送达的状态。前端只消费 `active_order_count` 与 `orders`，不在页面端自行推断。

### 代收字段
代收相关字段由后端明确返回：

- `is_cash_on_delivery`
- `cash_to_collect`

前端不自行猜测订单是否代收。

### 金额字段
统一口径：

- `order_amount`：订单金额
- `delivery_fee`：该单配送费
- `cash_to_collect`：该单骑手需代收金额

骑手卡汇总字段：

- `delivery_fee_total = Σ delivery_fee`
- `cod_amount_total = Σ cash_to_collect`
- `cod_order_count = 代收订单数`
- `active_order_count = 活跃订单数`

### 时间字段
后端直接返回标准时间字段：

- `accepted_at`
- `completed_at`

如果当前系统暂无稳定的 `accepted_at`，后端应固定一个可解释的替代口径后再输出，避免前端猜测。

## 排序规则
建议后端直接在返回前排好顺序：

- `busy` 栏：按 `active_order_count DESC`，再按姓名
- `available` 栏：按姓名
- `offline` 栏：按姓名

骑手展开后的订单列表按 `accepted_at ASC` 排序。

## 容错与空状态
即使骑手没有任何订单，也必须返回骑手本身，保持运力看板完整：

- `orders = []`
- 汇总字段为 `0`

页面需要处理以下空状态：

- 没有平台骑手
- 某个状态栏下没有骑手
- 某个骑手当前没有进行中订单
- 接口加载失败

文案保持和现有 `master` 一致，简洁直接。

## 前端实现落点
建议实现落点如下：

- `src/pages/master/index.astro`：只保留 tab 挂载与最小组装，不承载新业务细节
- `src/components/master/MasterRiderStatusPanel.astro`：骑手状态 tab 主面板
- `src/components/master/MasterRiderStatusCard.astro`：单个骑手卡片与展开区
- `src/lib/master-active-tab.ts`：把 `riders` 纳入合法 tab
- `src/lib/master-rider-status-view.ts`：整理骑手状态展示数据与文案映射
- `src/lib/master-dashboard-view.ts`：仅维持 tab/page state 等顶层状态，不承担复杂骑手订单聚合
- `src/pages/api/master/riders.ts`：新增 master riders 薄代理
- `src/scripts/master/rider-status-actions.ts`：骑手卡展开等轻交互

约束是：新功能必须优先拆分，避免继续往 `index.astro` 堆渲染、脚本和业务逻辑；`index.astro` 只做挂载，不做膨胀。

## 加载方式
建议与现有 `dispatch` tab 一样，走 SSR 首屏直出：

- 当 `tab=riders` 时，服务端请求 `/api/master/riders`
- 拿到数据后直接渲染 HTML

这样刷新即可看到完整状态，避免客户端二次加载才出内容。

## 分阶段实施
### Phase 1
- 新增 `骑手状态` tab
- 新增 `/api/master/riders` 代理
- 渲染顶部总览条
- 渲染三栏骑手状态看板
- 支持骑手卡展开查看进行中订单

### Phase 2
- 为骑手补“今日已完成”折叠区
- 补更细的异常提示与空状态文案
- 如确有必要，再加轻量筛选或排序增强

## 测试策略
### 页面 source / UI 回归
新增或扩展测试，至少覆盖：

- `href="/master?tab=riders"`
- `data-master-panel="riders"`
- 页面包含三栏文案：空闲、送餐中、下班
- 页面包含汇总字段文案：代收订单、代收总额、配送费总额

建议新增：

- `src/tests/pages/master/master-riders-ui.test.ts`

### API 路由测试
新增：

- `src/tests/pages/api/master-riders-route.test.ts`

至少覆盖：

- 未授权时返回 `401`
- 返回 `{ success: false, error: 'unauthorized' }`

### 纯函数/展示测试
如果后续抽出展示 helper，可补测试验证：

- 状态分组正确
- 空数组时空状态正确
- 金额字段缺失时显示 `0` 或 `-`

### 构建验证
实施时至少执行：

- `node --test <相关测试>`
- `pnpm build`

## 结论
第一版采用“`master` 新增独立 `骑手状态` tab + 平台骑手专用聚合接口 + 按状态分栏的骑手看板”方案。该方案能在不混入商家自定义骑手的前提下，快速提供平台运力、进行中订单、代收与配送费的统一可视化入口，并保持与现有 `master` 架构一致。