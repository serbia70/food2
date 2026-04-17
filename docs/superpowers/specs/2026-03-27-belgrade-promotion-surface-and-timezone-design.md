# Belgrade 时区统一与前台促销展示 Design

> 状态说明（历史设计）：这份设计记录的是当时围绕 Belgrade 时区与前台促销展示的收口方案；文中的旧测试文件名与实施拆分应按历史语境理解，不应直接当作当前仓库状态。

**Goal:** 统一 special promotion 与相关统计的 Europe/Belgrade 时间语义，并在前台店铺页增加“今日特价”集中展示与明确的促销价格表现。

**Why:** 用户已确认当前活动时间存在 1 小时偏差，统计口径也可能受同类时区问题影响；同时当前菜单卡片虽然会显示活动价，但没有原价对比和促销标识，顾客容易误以为活动价就是日常价格。此次设计同时解决“时间统一”和“促销可感知”两个问题，但不扩展到多时区或新的营销体系。

## Scope

本次设计包含三部分：

- 前后端无时区时间字符串统一按 `Europe/Belgrade` 解释
- 店铺页增加“今日特价”模块，只在当前存在生效 special 活动时展示
- 菜品卡片价格区改成促销态：活动价 + 原价删除线 + `今日特价` 标签

本次明确不做：

- 用户可选时区
- 多店铺多时区配置
- 新增促销类型
- 新接口或独立营销页
- 大型顶部 banner 或复杂营销轮播

## Current Problems

### 1. 活动时间存在贝尔格莱德时区偏差

用户已验证“把活动时间往前拨一个小时才会生效”，说明前后端对无时区 datetime 的解释不一致。当前虽然部分链路已修复，但仓库里仍有残余风险点，需要统一规则而不是局部打补丁。

### 2. 统计窗口可能继续按错误自然日/自然月计算

“今天 / 本月 / 当前活动中”这类语义如果仍混用 `time.Now()`、`new Date(...)`、`date('now')`、`LIKE 'YYYY-MM-DD%'` 或浏览器本地时区 fallback，就可能在贝尔格莱德午夜附近出现错天、错月、错活动状态。

### 3. 菜品卡片没有表达“这是促销价”

当前 `src/components/MenuList.tsx` 已经根据 `resolveCartItemUnitPrice(...)` 显示活动价，但价格位只显示最终数值，没有原价删除线、促销标签或层级区分，用户会误以为这是商品原价。

### 4. 前台没有促销集中入口

`src/pages/[slug]/index.astro` 已拿到 `shop.promotions`，但店铺页没有任何“今日特价 / 今日促销”集中展示位，顾客只能在浏览菜单时被动发现局部价格变化。

## Files

- Modify: `src/store/cartStore.ts`
- Modify: `src/components/MenuList.tsx`
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/components/CartModal.tsx`
- Modify: `foos2Go/internal/handlers/promotions.go`
- Modify: `foos2Go/internal/handlers/master_init_data.go`
- Modify: `foos2Go/internal/handlers/reservation.go`
- Modify: `foos2Go/internal/handlers/order_numbering.go`
- Test: `src/lib/cart-store-promotions.test.ts`
- Test: `src/pages/menu-list-promotions.test.ts`
- Test: 新增店铺页“今日特价”模块相关前端测试
- Test: `foos2Go/internal/handlers/master_stats_test．go（历史文件名）`

## Design

### 1. 全系统固定收口到 Europe/Belgrade

规则定死：

> 所有无时区的活动/统计时间字符串，一律按 `Europe/Belgrade` 本地时间解释。

含义如下：

- 前端 special promotion 的 `starts_at` / `ends_at` 使用贝尔格莱德本地语义
- 后端 promotion 时间解析使用 `orderNoLocation`
- “今天 / 本月 / 活动中 / 今日预约 / 今日佣金 / 本月佣金”全部改成明确区间比较
- 不再依赖浏览器本地时区、服务器默认时区或 SQLite `now/localtime` 的隐式行为

本次不引入时区配置项，整个系统只支持一个业务时区：`Europe/Belgrade`。

### 2. 店铺页新增“今日特价”模块，但只在有生效 special 时显示

在 `src/pages/[slug]/index.astro` 的店铺头部信息下方、菜单列表上方增加一个轻量模块：

- 标题：`今日特价` / `今日促销`
- 内容：当前生效的 `special` 活动商品列表
- 没有数据时：整个模块不渲染，不显示空态，不占空间

这样用户进入页面时能先看到今天有哪些特价菜，但页面不会因为没有活动而多出一块空壳。

### 3. “今日特价”模块只消费已有 promotions + 菜单数据，不新增接口

继续使用现有 `shop.promotions` 和菜单数据，不新增 API。前台增加一层只读归一化逻辑，负责：

1. 过滤当前在贝尔格莱德时间下生效的 `special`
2. 展开 `selected_products`
3. 关联到真实菜品
4. 生成给顶部模块使用的促销商品列表
5. 同时生成给价格结算使用的 `specialPromotions` 映射

这样可以避免顶部模块、菜单卡片、购物车分别实现一套各自不同的促销判断。

### 4. “今日特价”模块的筛选规则

商品进入模块必须同时满足：

- `promo_type === 'special'`
- `is_active` 为真
- 当前时间在 `starts_at ~ ends_at` 范围内
- 能关联到菜单中的真实商品
- `special_price_rsd > 0`

如果同一个商品被多条 special 命中：

- 前台只展示一次
- 取最终生效价
- 优先取更低的特价
- 若特价相同，取开始时间更近的一条

这样可以避免一个商品在顶部重复出现，或不同位置显示不同价格。

### 5. “今日特价”模块的展示与交互

每个促销商品卡片至少展示：

- 菜名
- 活动价
- 原价删除线
- `今日特价` 标签

交互行为：

- 点击某个促销商品，滚动到菜单中的对应菜品卡片
- 模块保持轻量，不做复杂弹层或二级详情
- 排序规则：先按特价更低优先，再按原菜单顺序稳定展示

目标是“快速感知 + 快速跳转”，不是做独立营销页。

### 6. 菜品卡片价格位改成明确的促销态

`src/components/MenuList.tsx` 中活动商品价格区改为：

- 红色粗体活动价
- 灰色原价删除线
- 小型 `今日特价` 标签

非活动商品保持原样。

这样用户在菜单浏览阶段也能一眼看出“这是活动价”，而不是仅仅把原价替换成一个更小的数字。

### 7. 购物车与菜单展示必须共用同一套价格判定

购物车结算、菜单卡片、顶部“今日特价”模块必须基于同一套生效逻辑：

- 同一时刻是否生效要一致
- 同一商品的特价要一致
- 不能出现菜单显示 999、购物车又按 1535 结算，或顶部显示活动但菜单仍按原价的情况

因此顶部模块与卡片展示必须复用现有 special promotion 归一化能力，而不是另写一套轻量判断。

### 8. 时区治理只做“统一解释 + 明确边界”，不扩展到更大架构

本次后端治理的原则：

- 对“今天 / 本月 / 当前活动中”统一使用 `belgradeNow()`、`belgradeDayRange()`、`belgradeMonthRange()`
- SQL 统一改成 `datetime(x) >= datetime(?) AND datetime(x) < datetime(?)`
- 清理剩余 `LIKE 'YYYY-MM-DD%'`、`strftime('now')`、`date('now')`、裸 `time.Now()` 参与业务边界判断的地方

这次不做数据库存储格式迁移，不改成带时区字段的全新数据模型，只收口现有语义。

## Verification

### 前端测试

至少覆盖：

1. 无时区 promotion datetime 按 `Europe/Belgrade` 解释
2. 活动商品显示活动价、原价删除线、`今日特价` 标签
3. 无活动时不渲染“今日特价”模块
4. 有活动时渲染模块，并只展示生效 special 商品
5. 同商品命中多条 special 时只展示一次并取最终规则结果
6. 顶部模块点击后可定位到对应菜品卡片

### 后端测试

至少覆盖：

1. 贝尔格莱德“今日 / 本月”边界正确
2. 午夜前后订单、佣金、预约不会算错天
3. promotion 时间解析与前端语义一致
4. DST 切换时活动状态与统计窗口仍按贝尔格莱德本地时间工作

### 手动检查

1. 把活动设置为贝尔格莱德 18:00 开始，应在当地 18:00 准时生效，不需要手动前拨 1 小时
2. 有 special 活动时，店铺页显示“今日特价”模块
3. 没有生效活动时，不显示该模块
4. 菜单卡片上的活动商品能同时看到活动价和原价删除线
5. 菜单卡片、顶部模块、购物车三处价格一致
6. 跨午夜后，今日统计和今日活动状态不会跳错天
