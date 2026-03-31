# 2026-03-31 — 全栈彻底重构（前后端一起重做）Design

## 背景

当前 `food2astro` 与其配套后端 `foos2Go` 已经过多轮修补，出现了持续放大维护成本的问题：

1. 页面入口过重：`src/pages/[slug]/index.astro`、`src/pages/master/index.astro`、admin 相关脚本承担了过多数据获取、状态拼装、展示和交互逻辑。
2. 共享层边界不清：前端存在大量 `lib/`、`scripts/`、页面层混杂的情况；后端也存在 handler、业务规则、调度逻辑、HTTP DTO 混在一起的问题。
3. 字段和契约不统一：同一语义存在 `snake_case` / `camelCase`、旧字段 / 新字段并行兼容，导致页面里出现大量 fallback 和猜测性兼容代码。
4. 功能耦合过高：修复一个区域（如 master/admin 外卖员链路）时，容易误伤公共店铺页或其他看似无关的模块。
5. 浏览器交互污染严重：较多逻辑通过 `window.*` 全局挂载或大脚本集中注册，导致职责模糊，调试困难。
6. 当前仓库是测试版，用户已经完成完整备份，可接受激进重构；目标是功能保持、界面大致保持，但代码层面彻底换骨，不保留历史补丁式残留。

用户已明确确认以下约束：

- 允许删除多余、无效、冲突、重复代码。
- 允许误删后从备份目录 `D:/ai/food/.worktrees/260311-1` 回查恢复。
- 重构范围包含 `food2astro` 与配套 `foos2Go`，并且 **不兼容旧接口/旧数据结构**。
- 最终目标是：修改简单、不出错、运行稳定、模块独立、避免继续长成屎山。

## 目标

1. 前后端一起建立一套新的清晰分层架构，彻底淘汰补丁式实现。
2. 统一领域模型、HTTP JSON 契约、认证边界和错误模型。
3. 将公共前台、admin、master 三大前端子系统拆成清晰独立的 feature。
4. 将后端拆成 domain / application / http / infra / jobs 的稳定结构。
5. 保持现有功能与界面大致一致，但删除历史兼容、重复、无效和冲突代码。
6. 建立重构期的强验证策略：每个阶段先测试、再实现、再删旧代码、再构建验证。

## 非目标

- 不追求这次重构顺带做 UI 视觉大改。
- 不保留旧接口兼容层、双写逻辑、legacy fallback。
- 不为了“保险”保留第二套长期并存的新旧目录。
- 不引入不必要的新第三方依赖。
- 不在同一批次中同时完成所有子系统改造后才验证。

## 方案对比

### 方案 A —— 一次性全量推倒重写

做法：前后端、页面、API、状态管理、共享层一次性替换。

**优点：**
- 心理上最像“全新项目”。
- 旧结构残留最少。

**缺点：**
- 风险极高。
- 无法快速定位是哪个子系统引入问题。
- 很容易在未验证状态下堆出第二个更大的屎山。

### 方案 B（推荐）—— 先定新内核，再按子系统逐块替换

做法：
- 先统一共享层、认证、API 契约、错误模型、领域模型。
- 再按顺序重建公共前台 → admin → master。
- 每完成一个 feature 或阶段，就删除对应旧实现并做构建/测试验证。

**优点：**
- 最符合“原地重建，但不保留残留”的目标。
- 共享边界先稳定，后续页面不容易再互相污染。
- 每阶段都可验证、可停、可纠偏。

**缺点：**
- 前期需要先做基础层设计，短期看不到完整页面成果。
- 需要严格执行边界和删除策略，不能一边重写一边偷复用旧脏代码。

### 方案 C —— 先从 UI 重新写起，再倒逼 API/共享层调整

**优点：**
- 最容易快速看到“新页面”。

**缺点：**
- 会继续受旧后端契约和旧共享层拖累。
- 最后仍然需要返工底层边界，重复劳动高。

## 推荐结论

采用 **方案 B：先定新内核，再按子系统逐块替换**。

原因：当前真正的问题不是某个页面写得丑，而是 **基础模型、接口契约、共享边界和 feature 切分都不稳定**。如果不先把基础层收口，任何“重写页面”最后都会再次滑回补丁式结构。

## 最终设计

---

## 一、总体重构策略

### 1. 原地重建，不新建第二套长期并行目录

本次重构在现有仓库内进行，不创建 `src_v2/`、`app_new/` 这类长期并行结构。

原则：
- 保留现有仓库、依赖、构建、测试、部署入口。
- 新实现按 feature 和分层落地。
- 对应旧模块在新模块稳定后立即删除。
- 不保留 `legacy`、`old`、`bak`、`tmp` 作为长期代码结构。

这样可以避免：
- Astro 路由和组件双系统并存。
- 两套 API/BFF 逻辑同时维护。
- 切换时大量路径冲突和最终清理困难。

### 2. 全仓大重构拆成 4 个子系统按顺序实施

实施顺序固定为：

1. **共享层 + API/BFF 基座**
2. **公共店铺前台**
3. **商家后台 admin**
4. **master 后台**

顺序原因：
- 共享层和契约先稳定，后续页面不会再反复推翻基础结构。
- 公共前台是最敏感和最常用的链路，优先确保稳定。
- admin 和 master 都依赖共享层与契约，放在后面风险更低。

---

## 二、前后端统一边界设计

### 1. 核心领域对象统一为 6 类

前后端统一建模以下 6 个核心对象：

1. `Shop`
2. `Order`
3. `Rider`
4. `Dispatch`
5. `MasterSettings`
6. `AuthSession`

要求：
- 每个对象只有一套对外 JSON 字段定义。
- 同一语义不再允许 `snake_case` / `camelCase` 双轨并存。
- 前端页面不再通过 `a || b || c` 猜测字段。
- 后端对外 JSON 统一输出标准化字段，前端只消费稳定结构。

### 2. JSON 对外命名统一使用 camelCase

约定：
- 后端 Go 内部可按 Go 结构组织。
- **HTTP JSON 对外统一使用 camelCase**。
- 前端所有 domain / application / UI 均只使用 camelCase。

结果：
- 页面不再处理 `footer_phone / footerPhone` 这类兼容。
- 组件 props 不再依赖多版本后端字段。
- 后端是单一字段权威来源。

### 3. API 分为两类

#### 业务 API
面向业务动作和页面查询，例如：
- `GET /api/shops/:shopSlug`
- `GET /api/shops/:shopSlug/menu`
- `POST /api/admin/orders/:orderId/status`
- `POST /api/admin/orders/:orderId/dispatch`
- `GET /api/master/dashboard`
- `GET /api/master/riders`

规则：
- 语义清晰，不泄漏历史数据库结构。
- 不返回页面不需要的大杂烩字段。

#### 会话 / 鉴权 API
专门处理：
- admin 登录
- master 登录
- session 查询
- logout

规则：
- 与业务 API 解耦。
- cookie / token 边界集中。
- 页面不再自己临时拼装鉴权判断。

### 4. BFF / proxy 只允许做 4 件事

`food2astro` 中的 BFF 路由只允许负责：

1. 读取 cookie / session
2. 转发到后端真实业务 API
3. 校验入参
4. 统一错误映射

明确禁止：
- 在 BFF 再实现一遍业务规则。
- 在 BFF 拼装页面 view-model。
- 在 BFF 对旧字段做历史兼容猜测。

### 5. 统一错误模型

所有接口统一返回如下结构之一：

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

规则：
- 前端统一只按 `ok` 判断成功或失败。
- 不再混用 `success`、`message`、`error`、`upstream_body`。
- 错误提示、日志、toast、表单错误都可以消费同一模型。

---

## 三、food2astro 新架构设计

### 1. 分层结构

建议最终收敛到如下结构：

- `src/domain/`
  - 纯领域类型、schema、枚举、业务规则纯函数
- `src/application/`
  - query / command / use-case
- `src/infra/`
  - HTTP client、session helper、proxy helper、storage adapter
- `src/features/`
  - 按业务 feature 分组
- `src/ui/`
  - 通用 UI 组件
- `src/pages/`
  - Astro 路由入口，仅负责装配

### 2. 页面入口瘦身规则

所有 `src/pages/**/*.astro` 只保留：
- 取参
- 调用 query/use-case
- 处理 page-level state
- 渲染 screen component

明确不再允许：
- 多段 fetch 直接堆在页面里
- 大量 `parseJSON<any>`
- 页面内自行兼容多套字段
- 页面同时承担业务规则、视图模型、样式和事件处理

### 3. feature 按业务拆分

#### 公共前台
- `shop-shell`
- `cart`
- `user-center`
- `dine-in`
- `reservation`

#### admin
- `admin-orders`
- `admin-order-actions`
- `admin-dispatch`
- `admin-archive`
- `admin-riders`

#### master
- `master-overview`
- `master-shops`
- `master-settings`
- `master-backup`
- `master-dispatch`
- `master-riders`

规则：
- 每个 feature 自己拥有 components / actions / view-models / tests。
- 任何跨 feature 共享的业务规则必须回到 `domain` 或 `application`，不能互相 import UI 层私货。

### 4. 浏览器交互边界

重构后原则：
- 优先 island 内部自处理事件。
- 必要时通过明确 action/event 通信。
- 大面积 `window.*` 全局挂载要被消灭。
- 仅保留极少数明确注册且可追踪的全局行为。

目的：
- 减少页面和脚本之间的隐式耦合。
- 降低 hydration 失败时的灾难性影响面。
- 提高调试可定位性。

---

## 四、foos2Go 新架构设计

建议最终收敛到如下结构：

- `internal/domain/`
  - 实体、状态机、业务规则
- `internal/application/`
  - command / query / service
- `internal/http/`
  - handler、request/response DTO、middleware
- `internal/infra/`
  - DB、Telegram、外部服务、仓储实现
- `internal/jobs/`
  - cron、dispatch escalation 等任务

规则：
- HTTP handler 不再直接堆业务规则。
- cron/job 不再直接散改数据库细节。
- response DTO 与 domain model 解耦，对外只暴露稳定契约。

---

## 五、Phase 1：共享层 + API/BFF 基座

这是整个重构的第一阶段，也是最关键阶段。

### 目标

- 统一领域模型和 JSON 契约。
- 统一认证边界。
- 统一错误模型。
- 重写 BFF / proxy helper。
- 删除重复、冲突的数据转换和旧兼容字段处理。

### food2astro 侧设计

- `src/domain/` 建立 `Shop`、`Order`、`Rider`、`Dispatch`、`MasterSettings`、`AuthSession` 类型与 schema。
- `src/infra/` 建立统一 HTTP client、session helper、proxy helper。
- `src/application/` 建立页面查询和动作命令的基础结构。
- 旧 `lib/` 中重复或冲突的 normalizer、fallback helper、临时 payload builder 迁移后删除。

### foos2Go 侧设计

- 后端按领域模型统一输出 camelCase JSON DTO。
- auth、error、request validation、response shape 统一。
- 历史兼容字段停止输出。

### 完成标准

完成本阶段后应达到：
- 前后端对核心对象的结构理解一致。
- 新页面开发不需要再猜字段。
- admin / master / shop 都能复用一套稳定契约。

---

## 六、Phase 2：公共店铺前台

### 目标

界面和功能大体保持，但 `/[slug]` 页面结构彻底重写，使普通点餐、堂食、预订、用户中心、购物车边界清晰。

### 设计

#### 1. 店铺页拆成多个独立 feature
- `shop-shell`：页面壳和基础数据
- `cart`：购物车状态与动作
- `user-center`：用户信息与历史订单入口
- `dine-in`：堂食、桌号、桌台状态
- `reservation`：预订弹窗与表单

#### 2. `src/pages/[slug]/index.astro` 只做壳

只负责：
- 读取 slug 和 query
- 调页面级 query
- 拿到标准化 `ShopPageViewModel`
- 渲染 `ShopPageScreen`

#### 3. 页面数据统一通过单一 view-model 入口

统一由类似 `loadShopPageQuery()` 的用例返回：
- shop 基本信息
- menu
- promotions
- footer
- delivery 状态
- dine-in 状态
- reservation 状态
- table 模式状态

页面不再自行 fetch 和拼装。

#### 4. cart 状态独立

购物车只暴露明确 action：
- `addItem`
- `removeItem`
- `clearCart`
- `submitOrder`

UI 不直接改底层数据结构。

#### 5. 桌号 / 普通模式代码分离

同一路由，但不同 feature state；普通点餐和堂食逻辑不再混成一锅。

### 完成标准

- `/[slug]` 入口变薄。
- 普通点餐 / 堂食 / 预订互不误伤。
- 购物车、用户中心、预订具备清晰边界。

---

## 七、Phase 3：admin

### 目标

把 admin 从“大脚本 + 大量全局函数”重构成按用例拆开的后台工作台。

### 设计

拆成 5 个 feature：
- `admin-orders`
- `admin-order-actions`
- `admin-dispatch`
- `admin-archive`
- `admin-riders`

#### 1. 页面结构
- `src/pages/admin/[slug]/index.astro` 只做入口。
- 具体功能进入 feature 内部分治。

#### 2. 订单状态流转独立成 domain 规则
统一定义：
- 合法状态转换
- 哪些动作需要 rider 信息
- 哪些动作需要确认
- 哪些属于危险操作

#### 3. 派单逻辑与订单管理彻底分离
`admin-dispatch` 只处理 dispatch query/command，不再和归档、结账、订单 DOM 刷新糊在一起。

#### 4. 危险操作统一收口
归档、删除 archived 等统一走 command + confirm 流程，消灭散落的 `alert` / `prompt` / `confirm` 逻辑。

#### 5. 减少 `window.*`
优先组件内处理，必要的页面级协调通过 feature controller，而不是散装全局暴露。

### 完成标准

- 订单、派单、归档三块彻底解耦。
- 改派单不再误伤订单管理。
- admin 页的脚本体积和职责明显下降。

---

## 八、Phase 4：master

### 目标

保持 master 功能和界面大体一致，但变成真正模块化的控制台。

### 设计

拆成 6 个 feature：
- `master-overview`
- `master-shops`
- `master-settings`
- `master-backup`
- `master-dispatch`
- `master-riders`

#### 1. `src/pages/master/index.astro` 只做壳
只负责：
- 鉴权检查
- 读取 active tab
- 调对应 query/use-case
- 渲染对应 feature screen

#### 2. 每个 tab 自己拥有 loader / view-model / tests
任何 tab 的数据和 UI 不再依赖其他 tab 的内部实现。

#### 3. 样式跟组件走
不再继续往 `master/index.astro` 堆样式债务；tab 专属布局和组件样式下沉到 feature。

#### 4. command / query 分离
- Query：dashboard、shops、riders、dispatch、settings
- Command：更新设置、topup、订阅动作、dispatch 操作、backup

### 完成标准

- 改 riders 不影响 shops。
- 改 dispatch 不影响 settings。
- `master/index.astro` 变成很薄的路由壳。

---

## 九、删除与清理策略

### 1. 旧代码删除原则

新模块落地后，对应旧模块立即删除，不保留：
- 未使用 helper
- 历史兼容字段 fallback
- legacy builder
- 旧页面拼装逻辑
- 重复组件 / 重复 action / 重复 DTO

### 2. 允许激进删除，但必须有回查路径

用户已明确说明：
- 当前仓库外已有完整备份。
- 误删内容可从 `D:/ai/food/.worktrees/260311-1` 回查。

因此本次设计允许激进清理，但实施时仍需遵循：
- 先建立新实现
- 再删除旧实现
- 删除后立即跑测试和构建

### 3. 不保留长期双系统

禁止出现：
- 两套 `src/pages` 入口长期并存
- 两套 feature 同时工作
- 新旧组件并行使用超过一个迁移阶段

---

## 十、测试与稳定性设计

### 1. 契约测试
锁定：
- shop 数据结构
- order 状态结构
- rider/dispatch 结构
- auth session 结构

### 2. feature 级测试
每个 feature 都有自己的核心行为测试，例如：
- shop
- cart
- reservation
- admin-orders
- admin-dispatch
- master-riders
- master-dispatch

### 3. 页面级回归测试
锁关键入口：
- `/{slug}`
- `/admin/{slug}`
- `/master`
- 关键 tab

### 4. 构建验证
每阶段都必须跑：
- 相关 node tests
- `pnpm build`

### 5. 清理验证
每完成一个 feature：
- 删除对应旧实现
- 跑测试
- 确认无残留 import、旧 handler、旧兼容逻辑

---

## 十一、执行策略

真正落地时按以下顺序：

1. 先完成本 spec
2. 再写 implementation plan
3. 然后分阶段执行
4. 每阶段严格遵循：
   - 先写失败测试
   - 再写最小实现
   - 再删旧代码
   - 再跑验证

不允许直接一口气全仓乱改。

## Stop Conditions

以下情况必须停下重新对齐：

1. 某个阶段发现需要同时改动多个子系统且边界不清。
2. 为了让新实现工作，不得不重新引入旧兼容字段或双轨逻辑。
3. 测试与构建连续失败，且失败原因说明当前拆分方式不成立。
4. 页面视觉要大改，偏离“功能一样、界面基本一样”的目标。

## Definition of Done

本次全栈重构完成的标准是：

1. 前后端新契约稳定落地，历史兼容字段和重复结构被删除。
2. 公共前台、admin、master 都切换到新 feature 结构。
3. 页面入口明显瘦身，业务逻辑不再堆在 Astro 页面和大脚本中。
4. 大面积 `window.*`、页面猜字段、散装 fallback、重复 payload builder 被清除。
5. 每个阶段都有对应测试与构建验证通过。
6. 仓库中不再保留长期并存的新旧双系统和无效残留代码。
