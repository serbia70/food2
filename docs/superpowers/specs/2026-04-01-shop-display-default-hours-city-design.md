# Shop Display Defaults Alignment Design

**Goal:** 把前台首页、店铺页、CartModal、admin 设置页的城市与营业时间收口到同一条数据线：优先读店铺真实设置，缺失时读 master 全局默认，不再各自保留私有 fallback。

**Scope:** 本轮只收口“城市 + 营业时间”两类字段，以及它们在前台与 admin 的展示/判断逻辑；不顺带重做其他设置项，不改订单、骑手、支付等无关链路。

## Background

当前存在两条脱节的数据线：

1. admin `/admin/[slug]` 主要读店铺真实数据：
   - `settings.hours?.open/close`
   - `shop.city`
   - `shop.open_time/close_time` 等历史字段
2. 前台 `/`、`/[slug]`、`CartModal` 仍保留自己的 fallback 逻辑
   - 例如 `src/components/CartModal.tsx` 在营业时间缺失时直接硬编码 `10:00 - 23:00`

结果是：
- 前台能显示“贝尔格莱德”“10:00 - 23:00”
- admin 却显示“未设置”
- 用户看到的是同一店铺在不同入口读的不是一条线

这不是单纯的数据库缺值问题，而是前台与 admin 的解析规则已经分叉。

## Design Decision

采用“**店铺真实设置优先 + master 全局默认兜底 + 单一 resolver**”方案：

1. `master?tab=settings` 新增全局默认城市与全局默认营业时间
2. 新增共享 resolver，统一解析店铺展示设置
3. 前台首页、店铺页、CartModal、admin 设置页全部改为消费 resolver 输出
4. 删除前台/CartModal 私有硬编码 fallback

## Data Priority

统一优先级固定为：

1. **店铺显式值**
2. **master 全局默认**
3. **空值**（仅在前两者都没有时）

明确规则：

### 城市
- 店铺 `settings.city` 或店铺顶层 `shop.city` 有值 → 用店铺值
- 否则 → 用 master 默认城市
- 两者都没有 → 空

### 营业时间
- 仅当店铺 `hours.open` 与 `hours.close` 都是完整有效值时，才视为店铺自定义营业时间
- 只配了一半（只有 open 或只有 close）视为无效整组，回落到 master 默认营业时间
- master 默认也要求 `open + close` 同时存在才生效
- 两边都没有 → 空，不再自动写死 `10:00 - 23:00`

## Architecture

### 1. Master settings 增加全局默认字段

继续沿用现有 master settings JSON，新增例如：

```json
{
  "shopDefaults": {
    "city": "Belgrade",
    "hours": {
      "open": "10:00",
      "close": "23:00"
    }
  }
}
```

说明：
- 放在 master settings 里，避免新表/新接口
- `shopDefaults` 只存“兜底默认”，不覆盖店铺显式值

### 2. 新增 shop display resolver

新增共享 helper，输入：
- 原始 `shop`
- 解析后的店铺 `settings`
- 解析后的 `master settings`

输出至少包含：

```ts
{
  city: string,
  hours: {
    open: string,
    close: string,
  },
  hasShopCityOverride: boolean,
  hasShopHoursOverride: boolean,
}
```

职责只做展示设置解析，不承担保存逻辑。

### 3. 消费方全部统一走 resolver

#### admin `/admin/[slug]`
- 当前营业时间输入框直接拼：
  - `settings.hours?.open || shop.hours?.open || shop.open_time || ''`
- 改为使用 resolver 输出的 `hours.open/close`
- 城市下拉也改用 resolver 输出的 `city`
- 同时在 UI 上标明来源：
  - 店铺自定义
  - 或使用全局默认

#### 前台 `/[slug]`
- 店铺详情页显示城市/营业时间时，改为同样走 resolver
- 不再各自写 fallback 规则

#### 前台首页 `/`
- 首页店铺卡片若展示城市，也改为消费同一解析逻辑

#### `src/components/CartModal.tsx`
- 删除当前硬编码：

```ts
const openTime = settings.hours?.open || "10:00";
const closeTime = settings.hours?.close || "23:00";
```

- 改为使用 resolver 得到的营业时间
- `checkShopOpen()` 也只基于解析后的统一 hours 判断

## UI Behavior

### admin 页面显示规则

当店铺未自定义而使用 master 默认时：
- 输入框直接显示默认值
- 附近显示轻提示：`使用全局默认`

当店铺已自定义时：
- 显示店铺值
- 不显示“使用全局默认”

说明：
- 本轮先解决“值一致”问题
- 不要求在 UI 上立即实现复杂的“恢复默认”交互

### 前台页面显示规则

- 前台只显示 resolver 最终结果
- 不再暴露“这是店铺值还是默认值”
- 用户只需看到统一后的城市与营业时间

## Error Handling

- 店铺 settings JSON 非法 → 当作空对象，继续回落到 master 默认
- master settings JSON 非法 → 当作空对象，不影响页面渲染
- 店铺 hours 半残（只有一端） → 整组回落
- master 默认 hours 半残 → 视为无默认营业时间
- 前台若最终 hours 为空：
  - 关店提示不再伪造 `10:00 - 23:00`
  - 显示“营业时间未设置”或等价空态

## File Changes

### Modify
- `src/pages/master/index.astro`
  - 挂载 master settings 的默认城市/默认营业时间输入
- `src/components/admin/TabSettings.astro`
  - 城市/营业时间改为走统一解析结果
  - 增加“使用全局默认”提示
- `src/pages/admin/[slug]/index.astro`
  - 读取 master settings，并把店铺 settings + master settings 送进 resolver
- `src/components/CartModal.tsx`
  - 删除硬编码营业时间 fallback，改用 resolver 结果
- `src/pages/index.astro`
  - 若展示城市，改为走 resolver
- `src/pages/[slug]/index.astro`
  - 若展示营业时间/城市，改为走 resolver
- `src/pages/api/master/settings.ts`
  - 若当前已透传通用保存，可无需协议变化；否则补齐新字段透传

### Create
- `src/lib/shop-display-settings.ts`
  - 统一解析城市/营业时间
- `src/lib/shop-display-settings.test.ts`
  - 覆盖优先级、半残 hours、空值回落

### Tests to update
- `src/tests/pages/admin/admin-index-canonical-init.test.ts`
- `src/tests/pages/master/*settings*`（若已有相关测试）
- `src/tests/pages/*` 或 `CartModal` 相关测试

## Explicitly Remove

本轮明确删除：
- `CartModal` 私有 `10:00 - 23:00` 硬编码 fallback
- 前台页面各自维护的城市/营业时间默认规则
- admin 与前台各自分散的字段优先级判断

## Testing Plan

必须覆盖：

1. resolver 单测
   - 店铺值优先于 master 默认
   - 店铺缺值时回落到 master 默认
   - 店铺 hours 半残时整组回落
   - 双方都空时返回空

2. admin 页面测试
   - 店铺未设置营业时间时，页面显示 master 默认时间
   - 店铺未设置城市时，页面显示 master 默认城市
   - 不再只匹配旧表达式 `settings.hours || shop.open_time`

3. 前台/CartModal 测试
   - 关店提示时间来自统一解析结果
   - 不再硬编码 `10:00 - 23:00`

4. master settings 测试
   - 默认城市/默认营业时间可保存、可回读

## Acceptance Criteria

完成后必须满足：

- `/admin/02` 与 `/02` 的城市/营业时间来自同一套解析规则
- 店铺无值时，两边统一显示 master 默认
- `CartModal` 不再保留私有硬编码营业时间
- master settings 可以统一设置默认城市与默认营业时间
- 以后恢复单店真实数据时，不会再出现前台/admin 两套结果

## Non-Goals

以下不在本轮内：
- 一次性统一所有设置项（logo、telegram、map_url 等）
- 重构整个 shop info DTO
- 新增复杂“恢复全局默认”批量操作
- 修复历史已丢失的店铺数据本身
