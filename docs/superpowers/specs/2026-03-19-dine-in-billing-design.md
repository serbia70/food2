# 堂食订阅到期与余额分离设计

日期：2026-03-19

## 背景

当前“充值金额 / 余额”主要用于预订和外卖扣费，而堂食需要一套独立的年费订阅规则：

- 堂食开通后可以立即使用
- 账期按自然月 1 号对齐
- 到期前要有提醒
- 到期后要有宽限期
- 宽限期结束后要自动关闭堂食
- master 需要能随时停用、延长或手动改到期日
- admin 端需要能直接看到堂食到期时间和提醒状态

核心原则：**余额只管预订/外卖，堂食订阅只管堂食可用时间**，不要把年费混进钱包余额里。

## 目标

1. 将堂食订阅与钱包余额彻底拆分，避免语义混淆。
2. admin 端能清楚看到堂食订阅的到期日、宽限截止日和提醒颜色。
3. master 端能一眼看到哪些店铺快到期、已经到期、已手动停用。
4. master 可以对堂食订阅执行：
   - 默认延长 12 个月
   - 手动指定到期日
   - 手动停用 / 恢复
5. 宽限结束后，堂食可用状态必须自动关闭。

## 非目标

- 不把堂食年费塞进钱包余额。
- 不做按天/按月的分摊计费。
- 不改外卖/预订现有扣费逻辑。
- 不在本次设计里引入“堂食年费金额”输入框或账单流水展示。
- 不重做整个 billing 系统，只做“堂食订阅”这条线的独立化。

## 推荐方案

采用**独立堂食订阅状态 + 共享日期计算 helper + 现有余额逻辑保持不变**。

### 为什么选这个方案

- 余额和堂食是两种完全不同的业务概念，分开后更不容易误用。
- master / admin 两边都需要同一套到期逻辑，抽成共享 helper 可以避免两边算出来不一致。
- 保留现有余额逻辑，能把改动范围控制在“显示层 + 少量数据字段 + 订阅操作”这条线上。

## 规则定义

### 1) 日期与边界口径

所有堂食订阅状态都按**业务时区的自然日**计算，不按 UTC 毫秒差。

- 存储层可以保留 timestamp，但展示和判断前必须先归一到业务日期。
- 同一套边界规则必须同时用于 admin、master 和自动关停逻辑。

统一区间定义：

- `warning`：当前业务日期在 **[到期日 - 5 天, 到期日 - 1 天]**。
- `overdue`：当前业务日期在 **[到期日, 到期日 + 5 天]**。
- `auto_closed`：当前业务日期 **大于 到期日 + 5 天**，也就是到期日第 6 天 00:00 起。

### 2) 账期规则

- 堂食一旦开通，**立即可用**。
- 账期起算日固定为：**下一个自然月的 1 号**。
  - 例如 2027-02-15 开通，账期起算日为 2027-03-01。
  - 如果刚好在 1 号开通，也仍然算到**下个月 1 号**开始计期。
- 从开通当日到账期起算日之间，是**立即可用的过渡期**，不计入 12 个月订阅期。
- 到期日 = 账期起算日 + 12 个月。
- 宽限截止日 = 到期日 + 5 个自然日。

### 3) 提醒规则

- **黄色提醒**：到期前 5 天到 1 天。
- **红色提醒**：到期日当天到宽限期结束。
- **自动关闭**：宽限期结束后的第 6 天 00:00 起。

> 说明：只要 `enable_dine_in = false` 且停用原因明确，就不再显示黄/红倒计时，而是显示停用/关闭状态。

### 4) 手动停用规则

- master 可以随时手动关闭堂食。
- 手动停用后，系统应立即把堂食状态切到“已停用”。
- 手动停用**不删除到期日**，方便后续恢复或追溯。

### 5) 恢复 / 延长规则

- master 默认操作是**延长 12 个月**。
- 默认延长的基准：
  - 如果当前已有 `dine_in_expires_at`，就在该到期日基础上再加 12 个月。
  - 如果当前没有可用到期日，则以当前业务日期的下一个自然月 1 号为起点，再加 12 个月。
- 同时允许 master 手动指定一个新的到期日。
- 自定义到期日是“明确延长 / 修正”动作，**不能早于当前到期日**；如果当前没有可用到期日，则不能早于当前业务日期。
- 如果店铺当前还没超过宽限期，恢复后可以继续沿用原到期日期；如果已经超过宽限期，则必须先续期或改到期日后再恢复。
- 如果需要提前结束堂食，用**手动停用**，不要靠把到期日改早来实现。

## 数据模型与字段

### 建议新增的源数据字段（upstream / 后端）

建议把堂食订阅相关字段从钱包和其他 billing 状态中拆出来：

- `dine_in_billing_start_at`
- `dine_in_expires_at`
- `dine_in_grace_until`
- `dine_in_disabled_at`
- `dine_in_stop_reason`
- `enable_dine_in` 继续作为实际开关

其中：

- `dine_in_billing_start_at`：当前账期起算日
- `dine_in_expires_at`：当前到期日
- `dine_in_grace_until`：宽限截止日
- `dine_in_disabled_at`：被手动停用或自动关闭的时间
- `dine_in_stop_reason`：`manual` / `auto_expired` / 空值（兼容历史数据）

### 前端 view model 建议

在 `src/lib/master-shop-view.ts` 里把上述字段整理成前端使用的 camelCase：

- `dineInBillingStartAt`
- `dineInExpiresAt`
- `dineInGraceUntil`
- `dineInDisabledAt`
- `dineInStopReason`
- `dineInAlertLevel`
- `dineInStatusLabel`

### 兼容策略

如果 upstream 还没来得及新增字段，前端可以暂时把现有 `expire_date` 当作 `dine_in_expires_at` 的兼容回退值使用。

- 兼容期内：先保证页面展示正确。
- 稳定后：以新字段为准，`expire_date` 只保留兼容 fallback。

## 状态判定

建议把“显示状态”从“是否启用”与“日期关系”两部分组合出来。

### 运行状态

1. `manual_stopped`
   - `enable_dine_in = false`
   - `dine_in_stop_reason = manual`
   - 显示为“已停用”

2. `active`
   - `enable_dine_in = true`
   - 当前业务日期早于到期日前 5 天
   - 显示为“正常”

3. `warning`
   - `enable_dine_in = true`
   - 当前业务日期在到期日前 5 天到 1 天
   - 显示为黄色提醒

4. `overdue`
   - `enable_dine_in = true`
   - 当前业务日期在到期日当天到宽限期结束
   - 显示为红色提醒

5. `auto_closed`
   - `enable_dine_in = false`
   - `dine_in_stop_reason = auto_expired`
   - 显示为“已自动关闭”

6. `disabled_unknown`
   - `enable_dine_in = false`
   - `dine_in_stop_reason` 为空或无法识别
   - 显示为“已关闭（原因未知）”

### 状态优先级

- 手动停用 > 自动关闭 > 原因未知关闭 > 日期提醒
- 也就是说：只要 `enable_dine_in = false` 且原因明确，页面就不再显示黄/红倒计时，而是显示停用/关闭状态。

## 页面与交互改动

### 1) admin 页面

文件参考：`src/pages/admin/[slug]/index.astro`

改动方向：

- 在现有 billing 顶部区域旁边增加一个独立的“堂食订阅”提示卡。
- 卡片应展示：
  - 当前状态（正常 / 即将到期 / 逾期 / 已停用 / 已自动关闭 / 原因未知）
  - 账期起算日
  - 到期日
  - 宽限截止日
- 黄色 / 红色提醒使用明显背景色高亮。
- 当 `enable_dine_in = false` 时，展示“已停用”或“已自动关闭”，不要继续用黄/红警告色误导用户。
- 余额区域文案要明确只表示**预订 / 外卖余额**，不要再暗示它包含堂食年费。

### 2) master 店铺列表

文件参考：`src/components/master/MasterShopManagementTable.astro`

改动方向：

- 增加一列“堂食到期”或“堂食订阅状态”。
- 用同一套状态色展示：
  - 正常
  - 黄色提醒
  - 红色提醒
  - 已停用 / 已自动关闭
  - 原因未知关闭
- 排序优先级可以继续沿用“风险优先”思路，让快到期和已逾期的店铺更容易被看到。

### 3) master 编辑 / 管理面板

文件参考：

- `src/components/master/MasterShopEditPanel.astro`
- `src/pages/master/index.astro`
- `src/pages/api/master/shop-renew.ts`
- `src/pages/api/master/shops/[id].ts`

改动方向：

- 在店铺编辑区域增加一个“堂食订阅”小节。
- 小节里提供两个主要动作：
  - **延长一年**：默认动作
  - **自定义到期日**：手动输入目标日期
- 同时提供一个手动停用 / 恢复的动作入口。
- 续期时优先沿用现有 `shop-renew` 语义；如果后端已经把 renew 作为独立动作，就让它专门负责堂食续期，不要塞进钱包充值接口。
- 钱包充值仍然只走 `shop-balance`。

### 4) 余额文案调整

文件参考：`src/components/admin/TabRenew.astro`

改动方向：

- 把“钱包余额”文案改成更明确的“预订 / 外卖余额”。
- 说明文字里明确写出：
  - 余额只用于预订和外卖
  - 堂食年费是独立的时间型订阅
- 不在这个卡片里展示堂食年费金额。

## 自动关闭职责边界

由于当前仓库是 Astro 前端 / BFF，**自动关闭不应该只靠页面脚本**。

建议职责分工如下：

- **前端**：负责展示状态、发起续期 / 停用请求、读取最新字段。
- **上游后端或定时任务**：负责每日扫描并在超过宽限期后把 `enable_dine_in` 关闭，同时写入 `dine_in_stop_reason = auto_expired`。

也就是说，页面可以根据日期推导出“已经逾期”，但真正的“关堂食”必须由服务端落库完成。

## 实现建议（前端代码结构）

建议新增一个纯函数 helper 来统一日期与状态计算，避免 master / admin 各算一套：

- 计算剩余天数
- 判断黄 / 红 / 关闭
- 把原始字段整理成前端 view model

这样 master 列表和 admin 卡片可以共享同一套结果，减少偏差。

## 备选方案与取舍

### 方案 A：直接复用现有 `expire_date`

优点：
- 改动最少
- 可以快速上线

缺点：
- 容易和其他“店铺到期”概念混在一起
- 后面如果再加其他到期维度，会越来越乱

### 方案 B：独立堂食订阅字段 + 共享 helper

优点：
- 语义最清晰
- admin / master 可共用同一套状态计算
- 最适合当前“余额与订阅拆分”的目标

缺点：
- 需要补字段和回填兼容逻辑

### 方案 C：再加一张订阅流水表

优点：
- 审计能力最强
- 可以记录每次开通 / 续期 / 停用历史

缺点：
- 本次需求偏重 UI 和状态管理，复杂度偏高
- 不是当前最必要的第一步

### 选择

本次采用 **方案 B**。如果后续确实需要审计或对账，再单独引入订阅流水表。

## 测试与验收

### 单测 / 逻辑测试

建议补充或扩展：

- `src/lib/master-shop-view.test.ts`
  - 黄色提醒边界
  - 红色提醒边界
  - 自动关闭边界
  - 手动停用优先级
  - `expire_date` 兼容回退
  - 默认续期基准（已有到期日 / 无到期日）
  - 自定义到期日不能早于当前基准

如果状态计算 helper 单独抽文件，则给 helper 单独补测试。

### 页面验收

1. admin 页面能看到堂食到期日、宽限截止日和颜色提醒。
2. master 列表能看到每家店的堂食状态，快到期和已逾期能明显高亮。
3. master 能延长一年、手动改到期日、手动停用 / 恢复。
4. 余额充值不再影响堂食订阅状态。
5. 宽限期结束后，服务端能把堂食关掉，前端刷新后看到已关闭状态。

## 受影响的主要文件（实现时参考）

- `src/types/index.ts`
- `src/lib/master-shop-view.ts`
- `src/lib/master-shop-view.test.ts`
- `src/components/master/MasterShopManagementTable.astro`
- `src/components/master/MasterShopEditPanel.astro`
- `src/pages/master/index.astro`
- `src/pages/admin/[slug]/index.astro`
- `src/components/admin/TabRenew.astro`
- 可能需要扩展的上游代理接口：
  - `src/pages/api/master/shop-renew.ts`
  - `src/pages/api/master/shops/[id].ts`
  - 以及对应的 upstream API

## Definition of Done

- 堂食订阅与钱包余额在 UI 和数据语义上完全分离。
- admin / master 两边的状态颜色一致。
- 到期前 5 天黄色、到期后宽限期内红色、超出宽限期自动关闭。
- master 可以默认延长 12 个月，也可以自定义到期日。
- 余额仍只用于预订 / 外卖，不承载堂食年费。
