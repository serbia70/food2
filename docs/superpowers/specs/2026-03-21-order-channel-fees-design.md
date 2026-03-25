# 预订 / 外卖技术服务费拆分设计

日期：2026-03-21

## 背景

当前代码里还保留着一套“每月 1 号自动扣费”的旧表达方式，它把“费用提醒”“钱包余额”“套餐类型”混在了一起，和现在的业务要求不一致。

新的业务口径是：

- **预订** 和 **外卖** 是两条独立的收费计划
- 默认费率是全局配置，但**每家店可以单独覆盖**
- 预订可以是 **0%**，也就是免费
- 店铺层面的“恢复全局默认”只重置**费率**，不会把启用/停用状态一起抹掉
- admin 页面只负责展示 master 修改后的有效值，并且不再显示旧的“每月扣费 / 下次扣费日”文案

核心原则：**钱包余额只表示可用于预订 / 外卖的余额，预订 / 外卖技术服务费是两条独立计划，不再用旧的月费套餐语义去表达。**

## 目标

1. 把预订和外卖拆成两条独立计划。
2. master 可以配置两条计划的全局默认值。
3. 每家店可以覆盖这两条计划的启用状态和费率。
4. 预订支持 0% 免费配置，不能被当成“未设置”。
5. admin 页面展示 master 修改后的有效值，并和 master 侧保持同一套文案和状态口径。
6. 删除旧的“每月 1 号自动扣费 / 下次扣费日”提示，只保留余额和计划费率信息。

## 非目标

- 不改堂食年费订阅流程；堂食已经独立出来，这次不动它。
- 不新增新的账单流水表。
- 不改前台点餐的业务流程，只保证显示和配置同步。
- 不在本次设计里引入复杂的权限体系；沿用现有 master/admin 认证和代理路由。

## 方案概览

### 1) 统一的计划模型

把“预订”与“外卖”都当成独立的 `plan`：

- `enabled`：是否启用该计划
- `commissionType`：`percentage` / `per_order`
- `commissionValue`：费率数值，允许 `0`

展示层不再把 `0` 解释成“未设置”，而是显示成“免费”。

### 2) 全局默认 + 店铺覆盖

- master 全局设置提供两条计划的默认值
- 店铺编辑页可以覆盖这两条计划
- 店铺层只保存覆盖值，读取时由共享 helper 生成最终有效值
- “恢复全局默认”只重置费率字段，不改 `enabled`

### 3) 共享 helper

新增一个共享 helper 负责：

- 统一解析老字段和新字段
- 统一格式化费率文案
- 统一判断 `0%` 免费
- 统一输出 master / admin 两边都能用的视图字段

这样 master 列表、店铺编辑面板和 admin 页面会看到同一套规则，避免两边各算各的。

## 数据模型与兼容策略

### 建议的新字段

#### 全局默认（master settings）

- `reservation_enabled`
- `reservation_commission_type`
- `reservation_commission_value`
- `delivery_enabled`
- `delivery_commission_type`
- `delivery_commission_value`

#### 店铺覆盖（shop record）

- `reservation_enabled`
- `reservation_commission_type`
- `reservation_commission_value`
- `delivery_enabled`
- `delivery_commission_type`
- `delivery_commission_value`

### 兼容旧字段

为了不让现有页面和数据迁移一次性炸掉，前端需要保留兼容读取：

- 全局旧字段：`subscription_*` / `business_*`
- 店铺旧字段：`commission_type` / `commission_value` / `billing_plan_type`

兼容原则：

- 新字段优先
- 没有新字段时才回退到旧字段
- `0` 仍然是有效值，不能被默认值逻辑吞掉

## 页面与交互

### master 页面

#### 全局设置卡

`src/components/master/MasterPricingSettingsCard.astro` 要改成两个独立区块：

- 预订计划默认值
- 外卖计划默认值

每个区块都要显示：

- 启用状态
- 费率类型
- 费率数值
- 免费态提示

#### 店铺编辑面板

`src/components/master/MasterShopEditPanel.astro` 要支持两套覆盖项：

- 预订计划覆盖
- 外卖计划覆盖

每套都要支持：

- 启用 / 停用
- 费率类型
- 费率数值
- 恢复全局默认（只重置费率）

#### 店铺列表 / 详情

`src/components/master/MasterShopManagementTable.astro` 和 `src/pages/master/index.astro` 的详情面板要展示：

- 预订计划当前状态
- 外卖计划当前状态
- 当前是全局默认还是店铺覆盖
- 费率文本里要能直接看出是否免费

### admin 页面

`src/pages/admin/[slug]/index.astro` 和 `src/components/admin/TabRenew.astro` 要改成：

- 明确写出“余额只用于预订 / 外卖技术服务费”
- 分开显示预订计划和外卖计划
- 不再出现“每月 1 号自动扣费”
- 不再出现“下次扣费日”
- 保留余额不足类提醒，但把它当作余额提醒，而不是月费提醒

## 复制与文案规则

- 预订 0% 显示为“免费”
- 外卖 0% 也显示为“免费”
- 不使用“月费”“每月 1 号自动扣费”“下次扣费日”这类旧词
- 费用卡强调的是“技术服务费”，不是堂食年费
- 任何与堂食年费有关的文案都不要挪到这次的预订 / 外卖卡片里

## 状态与显示优先级

- 计划被停用时，显示停用态，不要再显示费率提醒色
- 计划启用且费率为 0 时，显示“免费”，不是“未设置”
- master 和 admin 的状态优先级必须一致

## 测试与验收

### 单测 / 逻辑测试

建议补充或扩展：

- `src/lib/master-commission-view.test.ts`
  - 0% 应显示为免费
  - `per_order` 仍然能正常格式化
- `src/lib/master-settings-view.test.ts`
  - 新全局字段可被正确读取
  - 旧字段仍可作为兼容回退
- `src/lib/master-shop-view.test.ts`
  - 店铺覆盖能正确生效
  - 恢复全局默认只重置费率，不改变启用状态
  - 0% 仍然是有效值

### 页面验收

1. master 全局设置卡能分别修改预订 / 外卖默认值。
2. 店铺编辑面板能分别覆盖预订 / 外卖计划。
3. “恢复全局默认”只重置费率字段。
4. admin 页面显示的是 master 修改后的有效值。
5. admin 页面不再出现旧的月费自动扣费文案。

## 主要受影响文件

- `src/lib/master-commission-view.ts`
- `src/lib/master-settings-view.ts`
- `src/lib/master-shop-view.ts`
- `src/types/index.ts`
- `src/components/master/MasterPricingSettingsCard.astro`
- `src/components/master/MasterShopEditPanel.astro`
- `src/components/master/MasterShopManagementTable.astro`
- `src/pages/master/index.astro`
- `src/pages/admin/[slug]/index.astro`
- `src/components/admin/TabRenew.astro`
- 对应的 `*.test.ts`

## 结论

这次改动的重点不是“再加一个套餐类型”，而是把**预订 / 外卖**两条收费计划彻底独立出来，并让 master 与 admin 看到同一套有效数据和同一套文案。
