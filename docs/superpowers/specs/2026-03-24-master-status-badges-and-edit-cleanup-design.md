# Master 门店状态红绿按钮与编辑面板精简 Design

**Goal:** 把 master 门店列表里的“门店状态”改成更直观的红绿项目按钮展示，并移除编辑店铺面板里重复的业务开关区，只保留基础信息与预订 / 外卖提成编辑。

**Status:** approved by user in chat on 2026-03-24

---

## 1. 用户已确认的口径

### 1.1 门店状态列
- 不再显示“正常运营”“外卖已锁定”“堂食点餐停止”“外卖堂食均停止”等汇总文案。
- 不再显示“开 / 关”文字。
- 只显示 3 个项目名按钮：`堂食`、`预订`、`外卖`。
- 布局固定为：
  - 第一行：`堂食`
  - 第二行：`预订`、`外卖`
- 颜色规则：
  - 开启 = 绿色
  - 关闭 = 红色
- 这些按钮 **只做展示，不提供点击切换能力**。
- 即使店铺总状态是“已停用 / 已过期”，这一列也 **不要额外显示总状态文字**。

### 1.2 编辑店铺面板
- 当前 `店铺业务开关` 分组是冗余的，要删除。
- 编辑面板保留：
  - 店铺名称
  - slug
  - 登录密码
  - 店铺总状态
  - 预订提成卡
  - 外卖提成卡
- 编辑面板删除：
  - `店铺业务开关`
  - 其中的 `外卖接单 / 堂食 / 预约接单` 三个可见开关
- `预订` / `外卖` 的启停继续由各自提成卡内部的 `启用` 字段控制。
- `堂食` 的启停继续由现有 `堂食订阅` 面板控制，本次不改它的入口和交互。

---

## 2. 设计决策

### 2.1 门店状态列从“汇总标签”改成“分项目状态按钮”

当前 `MasterShopManagementTable.astro` 使用：
- `shop.shopStateLabel`
- `shop.shopStateReason`

来输出一个汇总状态块。这个块的问题是：
- 它把多个业务状态压成一句话，用户不能一眼看出堂食 / 预订 / 外卖分别是否开启。
- 它和编辑面板里的业务开关形成重复心智。

改造后：
- 门店状态列直接基于 `MasterShopView` 里已经存在的 3 个布尔值渲染：
  - `enableDineIn`
  - `enableReservation`
  - `enableDelivery`
- 使用新的静态展示结构，例如：

```astro
<div class="shop-state-grid" aria-label="门店状态">
  <div class="shop-state-row shop-state-row-single">
    <span class:list={['shop-state-pill', shop.enableDineIn ? 'is-on' : 'is-off']}>堂食</span>
  </div>
  <div class="shop-state-row shop-state-row-double">
    <span class:list={['shop-state-pill', shop.enableReservation ? 'is-on' : 'is-off']}>预订</span>
    <span class:list={['shop-state-pill', shop.enableDelivery ? 'is-on' : 'is-off']}>外卖</span>
  </div>
</div>
```

样式目标：
- `is-on`：绿色底 + 绿色字 / 深绿字
- `is-off`：红色底 + 红色字 / 深红字
- 尺寸统一，按钮感强，但不带 hover 点击语义
- 保持表格行高稳定，不因为文案变化跳动

### 2.2 工具栏“门店状态”筛选本次不改

本次只改表格列展示与编辑面板排版，**不扩展到重做工具栏筛选逻辑**。

原因：
- 用户当前明确要求的是“门店状态这一列”的红绿展示，以及“编辑店铺”面板去掉冗余业务开关。
- 工具栏筛选涉及状态口径、选项命名与数据字段重新设计，属于独立交互问题。
- 如果把筛选一起重做，会把本次任务从 UI 精简扩大成状态筛选重构。

因此本次实现：
- `data-master-filter-status` 相关脚本保持现状。
- 不新增“全部开启 / 部分关闭 / 全部关闭”等新筛选口径。
- 后续如果用户要连筛选一起整理，再单独开任务。

### 2.3 保留底层状态数据，不强制重构 `master-shop-view.ts`

本次只改展示，不需要重写 `buildMasterShopView()` 的状态汇总逻辑。
原因：
- 表格新 UI 已可以直接使用现有 `enableDineIn / enableReservation / enableDelivery`。
- `shopStateLabel / shopStateReason` 可以先留在 view model 里，避免把本次 UI 调整扩大成状态建模重写。
- 未来如果别处仍依赖汇总状态，不会被这次改动破坏。

因此本次实现：
- **允许 `shopStateLabel / shopStateReason` 继续存在于 `MasterShopView`**
- 但 `MasterShopManagementTable.astro` 不再把它们作为主 UI 输出。

### 2.4 编辑店铺面板只保留“基础信息 + 提成设置”

`MasterShopEditPanel.astro` 改成更简单的结构：

1. 顶部标题区
   - 标题：`编辑店铺`
   - 副标题改成更贴近当前用途的文案，例如：`修改基础信息与预订 / 外卖提成`

2. 基础信息区
   - 店铺名称
   - slug
   - 登录密码
   - 状态

3. 提成设置区
   - 预订卡片（保留卡内 `启用 / 提成类型 / 提成数值`）
   - 外卖卡片（保留卡内 `启用 / 提成类型 / 提成数值`）

4. 保存区
   - `恢复全局默认`
   - `保存店铺修改`
   - 反馈文案

要删除的仅是这整块可见 UI：

```astro
<section class="fee-section">
  <div class="fee-section-head">
    <div class="fee-section-title">店铺业务开关</div>
    <div class="fee-section-note">控制店铺是否开放外卖接单、堂食和预约接单</div>
  </div>
  ...
</section>
```

### 2.5 删除可见业务开关，但不能破坏保存 payload

虽然用户要求删除编辑面板里的冗余业务开关区，但当前保存逻辑仍依赖这些字段：
- `enableDelivery`
- `enableDineIn`
- `enableReservation`

如果直接删掉表单字段而不补处理，`buildMasterShopEditPayload()` 会把缺失字段按默认值处理，造成错误保存。

因此本次规格固定为**单一路径**：
- `enableDelivery` 不再保留单独隐藏字段
- `enableReservation` 不再保留单独隐藏字段
- `enableDineIn` 继续保留为隐藏字段
- payload builder 在缺失 `enableDelivery / enableReservation` 时，**只从** `deliveryEnabled / reservationEnabled` 派生

#### 预订 / 外卖
- 可见业务开关删除后，真实值由提成卡内的：
  - `reservationEnabled`
  - `deliveryEnabled`
 代表。
- payload 层固定做法：
  - `enableReservation = reservationEnabled`
  - `enableDelivery = deliveryEnabled`
- 不再保留第二套隐藏字段，避免双数据源。

#### 堂食
- 本次不在编辑店铺面板里编辑堂食。
- 因此 `enableDineIn` 必须继续保留现有值，不能因为表单删除而被重置。
- 最小做法是：
  - 在编辑面板中保留一个隐藏字段 `enableDineIn`
  - `openShopEditPanel()` 打开面板时继续把当前店铺的堂食状态写进去
- 同时，不再保留可见的堂食开关 UI。

### 2.6 `master/index.astro` 的前端回填逻辑要同步清理

当前 `openShopEditPanel()` 会回填：
- `form.elements.enableDelivery`
- `form.elements.enableDineIn`
- `form.elements.enableReservation`

改造后，要求收敛为：
- 不再访问 `form.elements.enableDelivery`
- 不再访问 `form.elements.enableReservation`
- 继续回填 `form.elements.enableDineIn`
- `reservationEnabled / deliveryEnabled` 仍按当前提成卡字段回填

这样：
- UI 简化
- 保存协议不被破坏
- 真值来源单一
- 改动范围集中在当前任务涉及文件内

---

## 3. 影响文件

### 3.1 `src/components/master/MasterShopManagementTable.astro`
修改点：
- 用 3 个红绿状态按钮替换现有的：
  - `badge-status`
  - `shop.shopStateLabel`
  - `shop.shopStateReason`
- 新增状态按钮布局与颜色样式
- 不再输出“正常运营”等汇总文案

### 3.2 `src/components/master/MasterShopEditPanel.astro`
修改点：
- 删除 `店铺业务开关` 可见区块
- 副标题改成“基础信息 + 提成”导向文案
- 保留：
  - `name`
  - `slug`
  - `password`
  - `status`
  - `reservationEnabled`
  - `reservationCommissionType`
  - `reservationCommissionValue`
  - `deliveryEnabled`
  - `deliveryCommissionType`
  - `deliveryCommissionValue`
- 仅为堂食保留隐藏字段：
  - `enableDineIn`
- 不保留隐藏 `enableDelivery / enableReservation`

### 3.3 `src/pages/master/index.astro`
修改点：
- 清理 `openShopEditPanel()` 中对已删除可见开关的回填逻辑
- 只保留必要的隐藏字段回填
- 不改 `堂食订阅` 面板逻辑

### 3.4 `src/lib/master-shop-edit-payload.ts`
修改点：
- 调整 `enableDelivery / enableReservation / enableDineIn` 的取值策略，避免删除可见控件后误写默认值
- 要确保：
  - delivery 最终跟 `deliveryEnabled` 对齐
  - reservation 最终跟 `reservationEnabled` 对齐
  - dine-in 保持传入当前值，不被覆盖

### 3.5 测试文件
- `src/pages/master/master-billing-ui.test.ts`
  - 追加 / 更新对门店状态列和编辑面板源码的断言
- `src/lib/master-shop-edit-payload.test.ts`
  - 新增“删除可见业务开关后 payload 仍保持正确映射”的测试
- 如有必要：`src/lib/master-shop-view.test.ts`
  - 只在需要锁定状态按钮所依赖字段时补最小测试

---

## 4. 测试策略

### 4.1 表格 UI 源码断言
锁定以下结果：
- 门店状态列包含：`堂食`、`预订`、`外卖`
- 不再输出：`shop.shopStateLabel`
- 不再输出：`shop.shopStateReason`
- 使用基于 `shop.enableDineIn / shop.enableReservation / shop.enableDelivery` 的渲染
- 有绿色 / 红色状态类名，例如：`is-on` / `is-off`

### 4.2 编辑面板源码断言
锁定以下结果：
- 不再出现：`店铺业务开关`
- 不再出现可见的：`外卖接单`、`预约接单`
- 仍保留：
  - `name="reservationEnabled"`
  - `name="deliveryEnabled"`
  - `name="status"`
- 不再要求编辑面板存在可见或隐藏的：
  - `name="enableDelivery"`
  - `name="enableReservation"`
- `enableDineIn` 必须作为隐藏字段保留，不要求可见 label

### 4.3 页面脚本源码断言
至少锁定：
1. `openShopEditPanel()` 不再访问 `form.elements.enableDelivery`
2. `openShopEditPanel()` 不再访问 `form.elements.enableReservation`
3. `openShopEditPanel()` 继续回填 `form.elements.enableDineIn`
4. `reservationEnabled / deliveryEnabled` 仍按提成卡字段正常回填

### 4.4 payload 单测
至少覆盖：
1. 当表单没有 `enableDelivery` / `enableReservation` 字段时，payload 仍正确从 `deliveryEnabled` / `reservationEnabled` 推出对应值。
2. 当堂食值通过隐藏字段传入时，payload 保留原值。
3. 保存提成时不应意外打开或关闭与当前任务无关的业务状态。

### 4.5 聚焦验证
- `node --test src/lib/master-shop-edit-payload.test.ts`
- `node --test src/pages/master/master-billing-ui.test.ts`
- `pnpm build`

---

## 5. 不在本次范围内
- 不改 `堂食订阅` 面板的交互和 API。
- 不给门店状态列新增点击切换功能。
- 不重写后端返回的 `display_shop_state` / `display_shop_state_reason` 生成逻辑。
- 不做新的状态汇总算法，只替换 master 列表的展示方式。

---

## 6. 推荐实现顺序
1. 先补 `master-billing-ui.test.ts` 与 `master-shop-edit-payload.test.ts` 的失败测试。
2. 再改 `MasterShopManagementTable.astro` 的状态列输出。
3. 再改 `MasterShopEditPanel.astro`，删除冗余业务开关区。
4. 最后改 `master/index.astro` 与 `master-shop-edit-payload.ts`，确保删除可见开关后保存值仍正确。
5. 跑聚焦测试和 `pnpm build`。
