# 骑手预计取餐时间与通知 Design

**Goal:** 在 `/admin/[slug]` 外卖订单处理中增加“预计多久可取餐”能力，让商家发布给骑手时带上明确取餐预估；骑手端据此决定是否接单，并在无人接单时支持二次提醒与商家人工联系在线空闲骑手。第一阶段同时接入 Telegram 通知，WhatsApp 留作后续扩展。

**Why:** 当前后台订单卡可直接进入送餐流程，但缺少“何时到店取餐”的关键信息。现有骑手体系已经支持注册、登录、看板、接单与完成配送，但更接近“看到单就抢”的模式。对小城市 1~2 名骑手的场景，核心不是复杂调度，而是减少骑手白跑、减少商家空等，并保留人工联系兜底。

## Scope

本次设计聚焦外卖订单的“待骑手接单”发布流程，不扩展为完整自动调度平台：

- 商家点击 `送餐` 后，先选择固定预计取餐时间：`10 / 15 / 20 / 30 / 45` 分钟
- 订单进入新的中间态：`awaiting_courier`
- 所有空闲骑手可见并抢单，卡片优先突出“约 X 分钟后可取”
- 新单支持站内实时提醒、声音提醒、二次提醒
- 无人接单时，商家端明确看到状态，并可直接联系在线且空闲的骑手
- 外部通知首选 Telegram；WhatsApp 不在第一阶段落地，只在设计中预留扩展位

不在本次范围：

- 自动派单、智能排序、拼单、骑手评分
- 商家修改 ETA 后的再广播逻辑
- 短信通知
- WhatsApp Business API 实际接入

## Current Context

现有代码已经具备骑手基础链路：

- 骑手注册页：`src/pages/rider/register.astro`
- 骑手登录与统一入口：`src/pages/rider/login.astro`、`src/pages/rider/[restaurantId]/index.astro`
- 骑手看板：`src/pages/rider/dashboard.astro`
- 骑手状态代理：`src/pages/api/rider/status.ts`
- 骑手订单代理：`src/pages/api/rider/orders.ts`
- 商家后台订单卡：`src/components/admin/TabOrders.astro`

当前骑手看板会拉取订单并允许“接单配送”，接单时直接把订单更新为 `delivering` 并写入 `courier_name` / `courier_phone`。这说明现有模型适合从“抢单”扩展，而不是重做整套配送系统。

## Files

- Modify: `src/components/admin/TabOrders.astro`
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/pages/rider/dashboard.astro`
- Modify: `src/pages/api/rider/orders.ts`
- Modify: `src/pages/api/rider/status.ts`（若需要补在线空闲骑手查询代理则一并扩展）
- Possibly modify: `src/scripts/admin/orders.ts`
- Possibly modify: `src/scripts/admin/order-actions.ts`
- Possibly modify: `src/pages/api/order.ts` 或现有订单状态更新代理所依赖的调用点
- Add tests around order state mapping / rider board filtering in existing test areas under `src/lib/**` or `src/pages/**`

## Design

### 1. 新业务状态：`awaiting_courier`

商家点击 `送餐` 后，不再直接把订单推进到 `delivering`，而是先进入 `awaiting_courier`。

语义：

- 商家确认这是外卖单并准备呼叫骑手
- 当前尚未有骑手接单
- 订单已经对空闲骑手开放抢单

这样可以把“店家已发布”与“骑手已接单”分开，避免现在一键送餐造成状态语义不准确。

管理后台状态文案建议：

- `awaiting_courier` → `待骑手接单`
- `delivering` → `配送中`

骑手端允许接单的条件改为：

- `awaiting_courier` 且未绑定 `courier_phone`

不再把普通 `pending` 直接暴露为骑手可抢订单，避免骑手看到尚未准备发布的订单。

### 2. 商家端交互：送餐前先选 ETA

在 `src/components/admin/TabOrders.astro` 当前“送餐”操作上增加一个轻量弹层，而不是把按钮拆成多按钮。

弹层内容：

- 标题：`预计多久可取餐？`
- 固定选项：`10 / 15 / 20 / 30 / 45 分钟`
- 主按钮：`通知骑手`
- 取消按钮：`取消`

确认后执行：

1. 计算 `pickup_eta_minutes`
2. 计算 `pickup_ready_at = now + eta`
3. 更新订单状态为 `awaiting_courier`
4. 初始化广播元数据
5. 刷新订单卡显示
6. 触发骑手通知链路

这样可保持商家操作成本低，同时把 ETA 变成结构化数据，而不是备注文本。

### 3. 订单元数据

建议在订单模型或其可持久化扩展字段中新增以下信息：

- `pickup_eta_minutes`: number
- `pickup_ready_at`: datetime string
- `rider_broadcasted_at`: datetime string
- `rider_remind_count`: number
- `rider_last_reminded_at`: datetime string

可选记录：

- `rider_contact_attempted_at`: datetime string

这些字段的作用：

- 给骑手端展示“约 X 分钟后可取”
- 给商家端展示已提醒次数与当前状态
- 支持无人接单的二次提醒策略
- 为后续 Telegram / WhatsApp 扩展保留稳定数据源

如果后端暂时无法直接新增结构化列，可短期放在现有 JSON 扩展字段中，但前端状态映射仍应统一读取，不要把 ETA 混成自由文本备注。

### 4. 骑手端展示与抢单逻辑

骑手看板的可抢订单卡在 `src/pages/rider/dashboard.astro` 增强为：

展示优先级：

1. `约 X 分钟后可取`
2. 店名
3. 地址
4. 金额
5. 联系电话
6. `接单配送`

视觉要求：

- ETA 作为卡片主提示，字号和颜色高于其他辅助信息
- 新到达的可抢订单卡置顶并高亮
- 新订单到达时播放提示音
- 页面可见时弹站内提示条

接单时：

- 仅允许第一个成功提交的骑手占单
- 更新状态为 `delivering`
- 回写 `courier_name` / `courier_phone`
- 其他骑手端刷新后自动移除该单

并发保护：

- 若骑手点击接单时订单已被其他骑手抢走，返回明确错误：`该订单已被其他骑手接单`
- 骑手端收到该错误后提示并立即刷新列表

### 5. 通知机制

第一阶段通知采用“四层”设计：

#### 5.1 站内实时提醒

骑手看板在订单列表刷新或订阅更新时，识别新进入 `awaiting_courier` 的订单：

- 卡片置顶
- 高亮边框或高亮底色
- 顶部短提示：`新订单，约 15 分钟后可取`

#### 5.2 声音提醒

骑手端在检测到新订单时播放提示音。若浏览器策略限制自动播放，则在首次交互后启用，并在 UI 上保留“开启提醒音”状态反馈。

#### 5.3 二次提醒

如果订单在设定窗口内仍无人接单：

- 再次提醒所有当前空闲骑手
- `rider_remind_count` 累加
- 商家端同步更新为“已提醒第 N 次”

第一版不做复杂调度，只做固定规则。例如：首次广播后若在一个短窗口内无人接单，则进行一次或两次再提醒。具体分钟数可在 implementation plan 时定成可配置常量。

#### 5.4 Telegram 通知

Telegram 作为第一阶段唯一外部通知渠道。

推荐模式：

- 每位骑手在系统中绑定 Telegram 标识
- 新单广播时，优先向“在线 + 空闲 + 已绑定 Telegram”的骑手发送个人 Telegram 消息
- 消息内容包含：门店名、ETA、地址、金额、联系电话、返回骑手看板的链接
- 群 Telegram 作为补充通道，用于备份广播或无人接单后的升级提醒

第一阶段按钮策略：

- `查看并接单`
- `联系门店`

第一阶段点击 `查看并接单` 后：

- 跳转到平台骑手页或订单详情页
- 平台内完成最终接单确认
- 后端校验订单是否仍为 `awaiting_courier`、是否已被抢走、当前 Telegram 绑定骑手是否允许接单

第二阶段再增加 Telegram 内直接接单：

- 个人消息按钮支持 `立即接单`
- 群消息也可提供接单按钮，但平台后端仍是唯一的抢单裁决者
- 所有 Telegram 按钮都必须校验骑手身份映射、订单状态、并发占单结果，不能把 Telegram 点击本身当作成功接单

Telegram 适合本项目的原因：

- bot 接入门槛低
- 对 1~2 个骑手场景足够灵活
- 可以同时支持个人主通知和群备份提醒
- 无人接单时可重复发送提醒消息
- 第一阶段可先用深链接快速落地，后续再平滑升级到 Telegram 内直接接单

WhatsApp 暂不接入，但保留“外部通知适配层”的设计思路，后续若业务需要，可在同一广播事件上追加 WhatsApp 通道。

### 6. 商家端无人接单与人工兜底

如果订单进入 `awaiting_courier` 后仍无人接单，商家端订单卡要明确可见：

- `待骑手接单`
- `约 X 分钟后可取`
- `已提醒 1 次 / 2 次`
- `无人接单`

并提供一个 `联系骑手` 入口。

该入口展示的不是所有骑手通讯录，而是：

- 当前在线
- 且状态为 `available`

展示字段：

- 骑手姓名
- 电话
- 当前状态

支持点击拨号。

这样既保留人工兜底，又尽量减少商家打给离线或忙碌骑手的无效联系。

### 7. 小城市场景原则

整个方案围绕以下原则：

- 不让骑手白跑：必须突出“何时可取”
- 不让商家空等：必须显示是否已广播、是否无人接单
- 不把流程锁死：自动广播失败后，商家仍可人工联系骑手

因此第一阶段不追求平台式智能派单，而是采用：

- 自动广播抢单
- 二次提醒
- 商家人工补位

这比大平台调度轻，但对本项目当前规模更有效。

## Error Handling

### 1. 抢单竞争

多个骑手同时点接单时，只允许一个成功。失败方得到明确错误并刷新。

### 2. 当前无空闲骑手

即使没有空闲骑手，商家仍可发布为 `awaiting_courier`。后台提示：`当前暂无空闲骑手，系统会在骑手上线后继续提醒`。若已有可联系骑手入口，则可展示为空态而不是报错。

### 3. 外部通知失败

Telegram 发送失败不应阻断订单进入 `awaiting_courier`。订单发布成功，但后台应有可见提示或日志，表明“站内已发布，Telegram 发送失败”。

### 4. ETA 缺失或脏数据

旧订单或异常数据没有 `pickup_eta_minutes` 时：

- 商家端不显示 ETA 标签
- 骑手端不把它识别为可抢订单，除非明确处于 `awaiting_courier`
- 避免从备注字符串反推 ETA，防止规则不可控

## Testing

1. 订单状态映射测试
   - `awaiting_courier` 在商家端正确显示为 `待骑手接单`
   - 只有 `awaiting_courier` + 未绑定骑手的订单在骑手端显示为可接单

2. ETA 展示测试
   - 商家端正确显示 `约 X 分钟后可取`
   - 骑手端卡片以 ETA 为最高优先级展示

3. 抢单并发测试
   - 两名骑手同时接单时，只有一个成功
   - 失败方收到已被接单提示

4. 无人接单提醒测试
   - 首次广播后达到阈值，`rider_remind_count` 正确递增
   - 商家端能看到提醒次数与“无人接单”状态

5. 联系骑手入口测试
   - 只展示在线且空闲骑手
   - 离线或 busy 骑手不出现在联系列表中

6. Telegram 通知测试
   - 订单广播时构造正确通知内容
   - Telegram 发送失败不阻断主流程

## Recommendation

按以下顺序推进实施：

1. 商家端 ETA 选择 + `awaiting_courier` 状态
2. 骑手端可抢订单与 ETA 展示
3. 二次提醒与商家端“无人接单”提示
4. 在线空闲骑手联系入口
5. Telegram 通知接入
6. 预留 WhatsApp 扩展但不在本轮实现

这个顺序能先把核心价值落地：商家知道单发出去了没有、骑手知道什么时候过去最合适、没人接时还能人工兜底。
