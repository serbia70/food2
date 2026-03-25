# master 店铺编辑术语与 admin 渠道费率对齐设计

日期：2026-03-24

## 背景

当前有两个实际问题：

1. `src/components/master/MasterShopEditPanel.astro` 上半部分用“预订 / 外卖”表示技术服务费计划，下半部分又用“外卖 / 堂食 / 预约”表示店铺业务开关。用户很容易把“预订”和“预约”理解成重复功能。
2. `src/pages/admin/[slug]/index.astro` 当前只把 `billing` 接口字段传给 `buildAdminOrderChannelBillingView()`，而 `src/lib/master-shop-view.ts` 的店铺视图有更完整的外卖覆盖取值优先级。因此当店铺已经在 master 侧覆盖外卖提成时，admin 侧仍可能回退显示全局默认 5%。

这两个问题都不是扣费算法本身错误，而是**术语表达不清**和**显示取值链路不一致**。

## 目标

1. 保留“预订”作为技术服务费计划名称。
2. 消除 master 店铺编辑页里“预订 / 预约”像重复功能的观感。
3. admin 页面显示店铺当前生效的预订 / 外卖费率，而不是只依赖 `billing` 接口里较弱的一组字段。
4. 不改变历史累计金额，不改实际扣费规则，只修正文案和当前生效值展示。

## 非目标

- 不改堂食年费 / 堂食订阅流程。
- 不改前台下单、预约下单、外卖接单的业务逻辑。
- 不新增新的账单模型或新的数据库字段。
- 不顺手重构整个 master / admin 账单体系。

## 方案对比

### 方案 A（推荐）

- 保留费率区的“预订 / 外卖”。
- 把店铺业务开关的文案改成更明确的“外卖接单 / 堂食 / 预约接单”或等价表达。
- admin 侧补齐与 master 一致的渠道费率取值优先级，优先显示店铺当前生效值。

**优点：**
- 改动面最小。
- 完全符合用户已确认的口径：保留“预订”，admin 显示当前生效值。
- 不需要改后端扣费逻辑。

**缺点：**
- admin 与 master 之间仍存在一部分相似解析逻辑，需要明确优先级并用测试锁住。

### 方案 B

- 把整页“预订”统一改成“预约”。
- admin 和 master 全部跟着改文案。

**不选原因：**
- 会把“技术服务费计划”和“预约接单开关”继续混在一起，只是换了一个词。

### 方案 C

- 不改 master 文案，只额外补说明。
- 通过改 `billing` 接口回包来修 admin 显示。

**不选原因：**
- 文案层面的重复感仍在。
- 当前 admin 页面已经拿到了 `shop` 与 `settings`，前端就能完成当前生效值解析，没必要把这次任务扩大成后端接口改造。

## 最终设计

### 1) master 店铺编辑页：明确区分“费率计划”和“业务开关”

`src/components/master/MasterShopEditPanel.astro` 保持上方两个费率区块：

- 预订
- 外卖

它们继续表示“未来订单的技术服务费规则”。

下方三个业务开关改成更明确的业务语义：

- 外卖接单
- 堂食
- 预约接单

同时给这组开关增加清晰的分组提示，例如“店铺业务开关”或等价说明，让用户能一眼区分：

- 上面控制的是**提成规则**
- 下面控制的是**店铺是否开放对应业务**

这一步只改显示文案和分组表达，不改任何表单字段名、提交字段名和保存逻辑。

### 2) admin 页面：店铺覆盖优先，`billing` 只作补位

`src/lib/admin-order-channel-billing-view.ts` 需要按“当前生效值”解析，而不是把 `billing` 快照当成最高优先级。

明确规则：

- **只要能从 `shop` 顶层字段或 `shop.settings` 判定出店铺当前覆盖值，就优先显示店铺值。**
- **只有店铺链路缺少该渠道费率时，才退回 `billing` 返回值。**
- 这样才能覆盖“master 已保存 6%，但 `billing` 仍残留 5%”的场景。

这不是简单复制 `src/lib/master-shop-view.ts`；而是：

- 前半段优先级与 `master-shop-view.ts` 的店铺字段解析保持一致
- 再额外补一层 `settings` fallback，适配 admin 页当前拿到的是原始 `shop + settings + billing` 多路数据

#### 预订费率优先级

按以下顺序取值：

1. `shop.reservation_commission_type` / `shop.reservation_commission_value`
2. `shop.subscriptionDeliveryCommissionType` / `shop.subscriptionDeliveryCommissionValue`
3. `shop.subscription_delivery_commission_type` / `shop.subscription_delivery_commission_value`
4. `settings.reservation_commission_type` / `settings.reservation_commission_value`
5. `settings.subscription_delivery_commission_type` / `settings.subscription_delivery_commission_value`
6. `billing.reservation_commission_type` / `billing.reservation_commission_value`
7. `billing.subscription_delivery_commission_type` / `billing.subscription_delivery_commission_value`
8. 默认值

说明：

- camelCase 只用于已投影到 `shop` 顶层对象的兼容别名。
- `settings` 里只读取 snake_case 键，不假设存在 camelCase。

#### 外卖费率优先级

先判定 override 语义：

- 先读 `shop.commission_mode`
- 若 `shop.commission_mode` 为 `null`、`undefined`、空字符串，或不是 `global` / `override` 这两个合法值之一，视为缺失，再读 `settings.commission_mode`
- 若 `settings.commission_mode` 也缺失或非法，则按 `global` 处理
- 只有最终判定 `commission_mode === 'override'` 时，`commission_override_*` / `commission_*` 才算店铺覆盖链的一部分

在这个前提下，按以下顺序取值：

1. `shop.delivery_commission_type` / `shop.delivery_commission_value`
2. `shop.businessDeliveryCommissionType` / `shop.businessDeliveryCommissionValue`
3. `shop.business_delivery_commission_type` / `shop.business_delivery_commission_value`
4. 若为 override：`shop.commission_override_type` / `shop.commission_override_value`
5. 若为 override：`shop.commission_type` / `shop.commission_value`
6. 若为 override：`shop.businessFeeRsd`
7. `settings.delivery_commission_type` / `settings.delivery_commission_value`
8. `settings.business_delivery_commission_type` / `settings.business_delivery_commission_value`
9. 若为 override：`settings.commission_override_type` / `settings.commission_override_value`
10. 若为 override：`settings.commission_type` / `settings.commission_value`
11. 若为 override：`settings.businessFeeRsd`
12. `billing.delivery_commission_type` / `billing.delivery_commission_value`
13. `billing.business_delivery_commission_type` / `billing.business_delivery_commission_value`
14. 默认值

核心要求：**只要 master 已经把店铺 101 的外卖提成保存成 6%，admin 页面就必须显示 6%，不能再掉回全局默认 5%。**

### 3) admin 页面组装输入时按来源传参

`src/pages/admin/[slug]/index.astro` 当前调用 `buildAdminOrderChannelBillingView()` 时，只传了 `billingData`。

这里改成把 admin 页面已经拿到的多路数据按来源传入，推荐接口形态：

- `billing: billingData`
- `shop: shop`
- `settings: settings`

这样 `buildAdminOrderChannelBillingView()` 可以在一个地方按来源顺序统一决定最终生效值，避免页面层手工拍平后再丢失“这个值来自哪里”的语义。
### 4) 保持显示口径，不扩大范围

这次修复只对齐**显示**和**表单术语**：

- 不改“这里只修改未来订单的提成计算规则，不会改变历史累计金额。”这类已有业务提示
- 不改佣金累计计算逻辑
- 不改余额提醒规则
- 不改堂食卡片内容

## 受影响文件

- `src/components/master/MasterShopEditPanel.astro`
- `src/lib/admin-order-channel-billing-view.ts`
- `src/lib/admin-order-channel-billing-view.test.ts`
- `src/pages/admin/[slug]/index.astro`
- `src/pages/admin/[slug]/billing-ui.test.ts`
- `src/pages/master/master-billing-ui.test.ts`

## 测试与验收

### 单测

1. `src/lib/admin-order-channel-billing-view.test.ts`
   - 新增失败用例：当 `billing.delivery_commission_value = 5`，但店铺覆盖字段是 6% 时，`deliveryPlan.displayText` 必须为 `6%`
   - 锁定“店铺覆盖优先于 billing”的冲突场景
   - 锁定预订 / 外卖的新旧字段回退优先级
   - 锁定 0% 仍显示“免费”
   - 锁定空字符串、`null`、`undefined` 不得错误覆盖有效 0 值
2. 补充优先级矩阵测试，至少覆盖：
   - shop 新字段 vs billing 字段冲突
   - shop legacy 字段 vs billing 字段冲突
   - settings 字段 vs billing 字段冲突
   - override 开 / 关时 `commission_override_*` 是否生效
   - `commission_mode` 为 `null` / `undefined` / 空字符串 / 非法值时，是否会正确回退到 `settings.commission_mode` 或最终按 `global` 处理
3. `src/pages/admin/[slug]/billing-ui.test.ts`
   - 锁定 admin 页面仍显示“预订 / 外卖余额”与技术服务费文案
4. `src/pages/master/master-billing-ui.test.ts`
   - 必须断言 master 编辑面板同时存在“预订”费率区与“预约接单”业务开关文案，并包含业务开关分组提示，避免再次回到歧义状态

### 页面级验收

1. master 店铺编辑页中，上方仍是“预订 / 外卖”费率区。
2. 下方业务开关不再直接显示“预约”，而是明确表达为“预约接单”一类业务开关语义。
3. 店铺 101 在 master 改成外卖 6% 后，`/admin/101` 显示“外卖：6%”。
4. 当 shop / settings / billing 同时存在冲突值时，admin 以店铺覆盖值为准，不以 billing 快照覆盖店铺值。
5. 没有店铺覆盖时，admin 按 `settings → billing → 默认值` 顺序回退显示。
6. 不引入新的“月费”“套餐切换”类旧文案。

## 结论

本次修复的核心不是新增功能，而是把同一页面中的两类概念分开：

- “预订 / 外卖”是**技术服务费计划**
- “外卖接单 / 堂食 / 预约接单”是**店铺业务开关**

同时让 admin 侧渠道费率展示与 master 侧已生效的店铺覆盖值保持一致，避免出现 master 显示 6%、admin 仍显示 5% 的错位。