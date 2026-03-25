# master 后台前端骨架简化 Design

日期：2026-03-25

## 背景

当前 master 后台已经积累出 3 类会持续放大修改成本的问题：

1. `src/pages/master/index.astro` 同时承担鉴权、初始化请求、数据聚合、展示数据拼装、CTA 拼装、页面结构、样式和前端行为，入口页已经变成“大总管”。
2. `src/lib/master-shop-view.ts`、`src/lib/master-settings-view.ts`、各类 payload builder 与页面层之间的职责边界不清，导致展示逻辑、兼容字段 fallback、提交逻辑交叉出现，改一个字段经常要同时改 page / component / lib。
3. `src/components/master/**` 中的组件已经有了较多业务感知，尤其是店铺管理相关组件消费了很多强耦合字段，页面层和组件层都在“理解业务”，造成反复排查 bug。

用户已明确确认以下约束：

- 目标是让代码更规范、更简洁，减少之后“改一个功能要反反复复排查 bug”的情况。
- 优先处理 **master 后台**。
- 希望 **前端优先收口，尽量不要修改后端/BFF**。
- 这次允许 **大胆修改**；当前副本是测试版，且用户已经备份，可接受较大范围但可逆的本地重构。

## 目标

1. 把 `src/pages/master/index.astro` 收缩成真正的页面入口层，不再承担大部分 dashboard 组装逻辑。
2. 为 master 页面建立统一的 dashboard view-model 边界，减少页面、组件、lib 对原始后端字段的直接耦合。
3. 明确拆开“展示模型”和“提交模型”：
   - 展示层：负责页面显示所需的数据结构
   - 提交层：负责保存 payload 的组装
4. 优先提高后续修改效率：新增或修改 master 展示字段时，尽量只改一处 builder 和一个局部组件。
5. 在不改后端协议的前提下，降低 master 相关前端文件之间的连锁改动概率。

## 非目标

- 不重写 `src/pages/api/**` 或后端接口。
- 不顺手重构 admin 页面或公共店铺页。
- 不修改实际扣费、鉴权、账单结算等后端业务规则。
- 不为本次任务额外引入新的第三方依赖。
- 不把所有 master 组件一次性重写成全新架构；只处理和 master 骨架简化直接相关的边界。

## 方案对比

### 方案 A（推荐）—— 先收口 dashboard 数据边界，再瘦身页面骨架

做法：

- 保留 `src/pages/api/**` 现状。
- 新增一层统一的 master dashboard builder，用于把 `shops`、`masterSettings`、`activeTab`、鉴权/加载状态整理成页面需要的结构。
- `src/pages/master/index.astro` 只保留入口职责。
- `buildMasterShopView()`、`buildMasterSettingsView()` 继续存在，但由新的 dashboard builder 统一调度。
- 组件尽量只消费整理好的 props，不再继续承担业务规则推导。

**优点：**
- 不动后端/BFF，符合当前约束。
- 最能减少“页面、组件、lib 同时改”的情况。
- 改动后可持续受益，后续加字段或调展示时更稳定。

**缺点：**
- 第一轮会碰到 master 页面主干与多个 lib 边界。
- 比纯拆文件更像一次结构性重整。

### 方案 B —— 先只拆 `src/pages/master/index.astro`

做法：

- 优先把 `master/index.astro` 大文件拆成多个 Astro 组件或片段模块。
- 暂时保留当前 view 组装方式和数据流。

**优点：**
- 文件会更短，见效快。
- 视觉上最容易感知“拆开了”。

**缺点：**
- 只是把复杂度分散到更多文件，底层数据边界仍然混乱。
- 后面继续加字段时，仍然容易出现多处同步改动。

### 方案 C —— 先只整理 `src/lib/master-*`

做法：

- 优先统一 `buildMasterShopView()`、`buildMasterSettingsView()` 和各类 payload builder 的输入输出。
- 页面和组件先尽量少动。

**优点：**
- 数据流角度最干净。
- 更容易补齐单元测试。

**缺点：**
- 用户侧感知较弱，`master/index.astro` 仍然会继续膨胀。
- 如果页面入口不收口，最终还是会把新逻辑再堆回页面层。

## 推荐结论

采用 **方案 A**。

原因：当前最核心的问题不是某一个文件太长，而是 **master 的展示数据边界没有真正封住**。只有先建立统一 dashboard view-model，再去瘦身页面和组件，才能真正降低之后的改动成本；否则只是把复杂度搬家。

## 最终设计

### 1) 将 `master/index.astro` 收缩为页面入口层

`src/pages/master/index.astro` 保留以下职责：

- 读取 cookie / 处理 master 鉴权
- 在 **无 cookie** 时继续沿用当前行为，直接 `302` 到 `/master/login`
- 请求 `/api/master/init`
- 读取当前 `activeTab`
- 调用统一 dashboard builder
- 将 builder 输出分发给各个 master 组件

职责边界固定为：

- page 只负责 **I/O 与装配**
- 所有进入页面渲染后的展示分支（例如 `ready` / `unauthorized` / `load_error`）统一由 dashboard builder 输出的 `pageState` 决定
- page 不再自行重复写一套展示态判断，避免和 builder 双重决策

从该页面中移出的内容包括：

- totals 聚合计算
- `shopViews` / `settingsView` 的拼装细节
- CTA / notice 的结构化数据构造
- 各类 panel 初始值拼装细节
- 能迁移到组件侧的局部样式与展示逻辑

目标不是“页面零逻辑”，而是让它只承担入口装配职责，不再承担 dashboard 规则本身。

### 2) 新增统一 dashboard builder

新增一层，例如：

- `src/lib/master-dashboard-view.ts`

职责：把页面初始化拿到的原始数据，转换成 master 页面真正消费的统一结构。

建议输入：

```ts
{
  shops,
  settings,
  activeTab,
  isUnauthorized,
  loadError,
}
```

建议输出结构：

```ts
type MasterDashboardPageState =
  | { kind: 'ready' }
  | { kind: 'unauthorized'; message: string; actions: MasterDashboardAction[] }
  | { kind: 'load_error'; message: string; actions: MasterDashboardAction[] };

type MasterDashboardAction =
  | { key: 'login'; kind: 'link'; label: string; href: string; className: string }
  | { key: 'logout' | 'refresh'; kind: 'button'; label: string; handler: 'logoutMaster' | 'reloadPage'; className: string };

type MasterDashboardView = {
  pageState: MasterDashboardPageState;
  overview: {
    totalShops: number;
    todayRevenue: number;
    todayOrders: number;
    monthCommission: number;
    totalBalance: number;
  };
  shopManagement: {
    shops: MasterShopView[];
    activeTab: 'overview' | 'shops' | 'settings' | 'backup';
  };
  settings: MasterSettingsView;
  notices: Array<{ kind: 'info' | 'warning' | 'error'; message: string }>;
  actions: MasterDashboardAction[];
  panels: {
    shopEdit: { defaultsFromSettings: boolean };
    shopTopup: Record<string, never>;
    shopDineIn: Record<string, never>;
  };
};
```

约束：

- `shopManagement.shops` 只能是展示层产出的 `MasterShopView[]`，禁止把原始 `shop` 透传给组件。
- `settings` 只能是 `MasterSettingsView`，禁止组件直接读取原始 settings。
- `pageState` 是进入渲染后的**唯一展示态决策源**。
- `actions` 的按钮动作只能使用离散 `handler`，由固定 handler map 执行，禁止重新回退成任意字符串脚本。
- `activeTab` 必须先经过现有 `normalizeMasterTab()` 归一化；dashboard builder 只接收合法 tab 值，不承担二次纠正非法原始输入。
- 组件 props 类型不暴露原始实体类型，优先通过类型签名在编译期阻止原始 `shop/settings` 直接流入组件。
- `panels` 若暂时没有复杂初始值，也必须保留显式结构，而不是让 page 回退成散乱变量。

其中：

- `overview`：概览卡片所需 totals 与摘要
- `shopManagement`：店铺表格所需的 `shops` 与当前 tab 等页面上下文
- `settings`：全局配置卡片所需的展示值
- `notices` / `actions`：页面提示与 CTA 的统一描述
- `panels`：编辑 / 充值 / 堂食订阅等面板的初始值或依赖数据
- `pageState`：页面级展示状态

这样 `buildMasterShopView()` 与 `buildMasterSettingsView()` 不再散落在 page 中直接被调用，而是由 dashboard builder 统一组织。

### 3) 收紧 `master-shop-view` 与 `master-settings-view` 的职责

#### `src/lib/master-shop-view.ts`

改造目标：
- 只负责“单店展示模型”的归一化
- 保留旧字段兼容、状态翻译、展示字段生成
- 不再承担 dashboard 层级的页面决策

保留其适合处理的内容：
- 单店渠道开关解析
- 账单/到期/堂食状态映射
- 行高亮 tone、显示标签、排序值
- 店铺相关展示字段生成

不再让它处理：
- 页面级 totals
- 页面 CTA / notice
- 页面 tab 或面板级装配逻辑

#### `src/lib/master-settings-view.ts`

改造目标：
- 只负责“全局设置展示模型”的归一化
- 保留全局费率、footer、storage、server、backup 等结构化展示值
- 不承载页面层决策

### 4) 明确拆开展示模型与提交模型

本次设计中，以下两类 builder 必须视为不同层：

#### 展示层
- `master-dashboard-view.ts`
- `master-shop-view.ts`
- `master-settings-view.ts`

职责：
- 解决显示所需的字段兼容与归一化
- 产生组件可直接消费的 view-model

#### 提交层
- `master-shop-edit-payload.ts`
- `master-pricing-settings-payload.ts`
- 其他 panel 保存用 payload builder

职责：
- 只负责把表单状态转换成接口请求 payload
- 不混入页面显示推导

结果是：
- 改页面显示时，优先改展示 builder
- 改保存协议时，优先改 payload builder
- 两边不再互相挤压职责

### 5) 组件改成“消费 props”，不继续推导业务

像 `src/components/master/MasterShopManagementTable.astro` 这一类组件，改造方向是：

- 保留表格/卡片渲染职责
- 尽量直接消费 view-model 中已经确定好的显示字段
- 组件内部只保留必要的 UI 格式化（例如数字格式化、纯展示 class 映射）
- 不再新增对原始后端字段或页面临时拼装值的依赖

这意味着：
- 业务规则集中在 builder
- 模板组件负责展示
- 页面负责装配

若某个组件当前 props 过多、字段间关系强耦合，则优先把它改成接收更稳定的结构化对象，而不是继续增加零散 props。

### 6) 第一轮重整范围

本轮只处理最值当、最影响后续开发效率的骨架问题，优先级如下：

1. `src/pages/master/index.astro`
2. `src/lib/master-dashboard-view.ts`（新增）
3. `src/lib/master-shop-view.ts`
4. `src/lib/master-settings-view.ts`
5. `src/components/master/MasterShopManagementTable.astro`
6. 与 master 页面直接耦合的 panel 初始值装配逻辑（按需收口）

其中：
- 编辑 / 充值 / 堂食订阅 panel 本身的 UI 结构不要求本轮全部重写
- 但如果它们的初始值拼装逻辑现在堆在 page 里，则应迁移到合适的 builder 或局部模块

### 7) 样式与脚本收口原则

`src/pages/master/index.astro` 当前包含大量页面级样式与行为脚本。本次不要求把所有 CSS/脚本都做成完美体系，但原则是：

- 能留在组件内部的样式，尽量移到对应组件
- 能留在局部组件行为中的脚本，不继续堆在 page 顶层
- 页面只保留确实属于入口装配层的少量逻辑

目标是防止 `master/index.astro` 在数据层收口后，又继续在样式/行为层无限膨胀。

## 受影响文件

### 必改
- `src/pages/master/index.astro`
- `src/lib/master-shop-view.ts`
- `src/lib/master-settings-view.ts`
- `src/components/master/MasterShopManagementTable.astro`

### 新增
- `src/lib/master-dashboard-view.ts`
- `src/lib/master-dashboard-view.test.ts`

### 可能同步调整
- `src/components/master/MasterShopEditPanel.astro`
- `src/components/master/MasterShopTopupPanel.astro`
- `src/components/master/MasterShopDineInPanel.astro`
- `src/lib/master-shop-edit-payload.ts`
- `src/lib/master-pricing-settings-payload.ts`
- `src/pages/master/master-billing-ui.test.ts`
- `src/lib/master-shop-view.test.ts`
- `src/lib/master-settings-view.test.ts`

## 测试与验收

### 单测

1. `src/lib/master-shop-view.test.ts`
   - 锁定单店状态、账单状态、堂食订阅状态、默认值 fallback
   - 防止重整过程中破坏已有字段兼容规则

2. `src/lib/master-settings-view.test.ts`
   - 锁定全局费率与设置归一化结果
   - 防止 dashboard builder 重构时把 settings 层逻辑意外改坏

3. `src/lib/master-dashboard-view.test.ts`（新增）
   - 锁定 overview totals 聚合
   - 锁定 pageState / notice / CTA 组装
   - 锁定 `shopManagement` / `settings` 输出结构
   - 锁定 `activeTab`、load error、unauthorized 等页面级分支
   - 明确断言组件输入不包含原始 `shop` / `settings`

4. 提交层回归测试
   - `src/lib/master-shop-edit-payload.test.ts` 必须继续通过
   - `src/lib/master-pricing-settings-payload.test.ts` 必须继续通过
   - 若因 builder 收口导致面板初始值来源调整，需要补充“加载 -> 打开面板 -> 提交 payload”路径的请求体回归断言，确保保存协议不变

### 页面级验收

1. `src/pages/master/index.astro` 前置逻辑中不再包含：
   - totals 的 `reduce` 聚合
   - CTA / notice 拼装
   - `shopViews` / `settingsView` 的直接组装
   - panel 初始值散乱变量拼装
2. `src/pages/master/index.astro` 仍保留：
   - cookie 鉴权
   - 无 cookie 直接跳转登录
   - `/api/master/init` 请求
   - `activeTab` 读取
   - 调用 dashboard builder
   - 组件装配
3. 页面仍能正常展示：
   - 概览区
   - 店铺管理区
   - 设置区
   - 相关面板入口
4. 组件层不得直接消费原始 `shop` / `settings`；店铺管理组件只消费 `MasterShopView[]`，设置组件只消费 `MasterSettingsView`。
5. 新增或修改 master 展示字段时，目标改动范围应收敛到：
   - 一个展示 builder
   - 一个局部组件
   若需要额外修改 page，必须是装配字段新增，而不是再次把业务规则带回 page。
6. 不要求改后端/BFF 即可完成本次结构整理。
7. 不改变当前业务行为与保存协议，只改变前端组织方式与职责边界。
8. 现有 payload builder 回归测试必须继续通过，确保保存协议未被重构误伤。

## 风险与控制

### 风险 1：只拆文件，不真正降低耦合

控制方式：
- 新文件不是为了“搬家”，而是要明确层级：page / dashboard builder / 单店 view / settings view / payload builder
- 若拆完后页面仍直接操纵大量原始字段，则说明本次设计未落地

### 风险 2：展示 builder 与 payload builder 再次混杂

控制方式：
- 在实现中明确：展示层不生成提交 payload，提交层不生成展示标签
- 代码审查重点关注职责越界

### 风险 3：组件 props 看似变少，但组件继续承担业务判断

控制方式：
- 组件内部只保留展示必需的 UI 级映射
- 业务决策尽量前移到 builder

## 结论

这次不是“把 master 页面拆小一点”这么简单，而是要把 master 后台前端改成更清晰的 4 层边界：

1. 页面入口层
2. dashboard 展示模型层
3. 组件展示层
4. 提交 payload 层

在不动后端/BFF 的前提下，这种改法最符合当前目标：**大胆重整、降低后续改动成本、减少反复排查 bug 的概率**。