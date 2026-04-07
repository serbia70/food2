# 自动续派与改派失效设计

**日期：** 2026-04-07  
**范围：** admin 派单、Telegram 接单回调、rider dashboard、自动续派

## 目标
在现有 `awaiting_courier -> delivering -> completed` 主状态机不变的前提下，实现：

- 骑手点“暂不接单”后，立即自动派给下一个骑手
- 当前轮派单在超时后自动续派给下一个骑手
- admin 在骑手接单前可随时改派到其他骑手
- 被替换/超时/拒单的旧骑手显示“已改派”或“接单超时”，且无法再接单
- 超时分钟数可配置，默认 5 分钟

## 约束
- 不新增新的订单主业务状态
- Telegram 与 rider dashboard 必须共用同一套“当前轮是否有效”的判定语义
- 前端置灰不是安全边界，后端必须真正拒绝失效骑手的旧 callback
- admin 仍是派单主入口

## 核心方案
采用“每单只认当前有效派单轮次”的模型。

订单仍保持原有主状态，额外在 `dispatch_meta` 中记录当前轮派单信息与已失效骑手集合。所有入口都只认当前轮骑手：

- 首次派单：写入当前轮骑手与过期时间
- 拒单：当前骑手立即失效并自动派下一个
- 超时：当前骑手失效并自动派下一个
- admin 改派：旧骑手立即失效，当前轮切到新骑手
- 旧 Telegram 按钮：后端统一判定为失效，不能再接单
- rider dashboard：旧骑手显示失效状态，按钮置灰

## 数据模型
在现有 `dispatch_meta` 上扩展以下字段：

```ts
interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId?: string;
  currentAssignedAt?: string;
  currentExpiresAt?: string;
  invalidatedRiderIds?: string[];
  lastInvalidationReason?: 'declined' | 'timeout' | 'reassigned' | null;
}
```

### 字段语义
- `currentRiderId`：当前轮唯一有效骑手
- `currentAssignedAt`：当前轮开始时间
- `currentExpiresAt`：当前轮接单截止时间
- `invalidatedRiderIds`：本单已被判定失效、不可再接单的骑手集合
- `lastInvalidationReason`：最近一次失效原因，用于 UI/提示文案

## 行为规则

### 1. 首次派单
admin 派给骑手 A 时：
- 订单状态维持 `awaiting_courier`
- 写入当前轮派单元数据
- 发送 Telegram 派单消息给 A
- rider dashboard 对 A 显示可操作按钮

### 2. 骑手拒单
A 点“暂不接单”后：
- A 记为 `declined`
- A 加入 `invalidatedRiderIds`
- 更新 `lastRiderDecision`
- 立即寻找下一个可用骑手 B
- 若存在 B，则写入新一轮 `currentRiderId/currentAssignedAt/currentExpiresAt` 并发消息给 B
- 若不存在 B，则订单保持 `awaiting_courier`，只记录当前轮已失效，等待后续人工处理或再次派单

### 3. 超时自动续派
当订单仍为 `awaiting_courier` 且 `now >= currentExpiresAt`：
- 当前骑手记为 `timeout`
- 当前骑手加入 `invalidatedRiderIds`
- 若存在下一个可用骑手，则立即切换新一轮并重发派单
- 若不存在，则仅记录超时失效结果

### 4. admin 手动改派
当 admin 把当前轮从 A 改派到 B：
- A 立刻记为 `reassigned`
- A 加入 `invalidatedRiderIds`
- 当前轮切到 B
- B 收到新的 Telegram 派单消息
- A 的旧按钮与 dashboard 操作均立即失效

### 5. 接单成功
只有当前轮有效骑手才能接单。接单后：
- 订单从 `awaiting_courier` 变为 `delivering`
- 写入骑手信息
- 当前轮结束
- 后续仍沿用现有“配送中 / 送餐完成”链路

## 后端判定规则
`src/pages/api/telegram/rider-claim.ts` 在签名与身份校验之外，还必须校验：

- 订单当前状态必须仍是 `awaiting_courier`
- callback 对应骑手必须等于 `currentRiderId`
- callback 对应骑手不能存在于 `invalidatedRiderIds`
- 当前时间不能超过 `currentExpiresAt`

任一条件不满足，都返回统一失效结果，不允许旧骑手重新抢回该单。

## UI 语义

### rider dashboard
- 当前有效骑手：显示 `接单 / 暂不接单`
- 当前配送骑手：显示 `送餐完成`
- 已被改派骑手：显示 `已改派`，按钮置灰
- 已超时骑手：显示 `接单超时`，按钮置灰
- 与当前轮无关的骑手：不显示可接单动作

### Telegram
- 新一轮骑手收到正常派单消息
- 旧骑手即使点击历史消息按钮，也只能得到“已改派/接单超时”的失效反馈

## 自动续派触发方式
自动续派由统一流程处理，触发源包括：
- 骑手拒单
- 超时扫描命中
- admin 手动改派

三者共享同一套“使旧骑手失效 -> 选择下一个骑手 -> 写入新一轮 -> 发消息”的主流程，避免分叉逻辑。

## 配置
新增可配置项：

- `dispatchAutoReassignMinutes`

规则：
- 默认值为 `5`
- 可改为 `10` 或其他需要的分钟数
- 本轮 `currentExpiresAt = currentAssignedAt + dispatchAutoReassignMinutes`

本轮先只做单一全局配置，不扩展为每店、每骑手、每时段多套策略。

## 测试策略

### 共享 helper
- 当前轮骑手可接单
- 已超时骑手显示 `接单超时`
- 已改派旧骑手显示 `已改派`
- `invalidatedRiderIds` 能排除失效骑手
- 到期判断能触发自动续派

### Telegram callback
- 当前有效骑手可正常接单
- 已拒单骑手再次点击旧按钮失败
- 已超时骑手点击旧按钮失败
- admin 改派后的旧骑手点击旧按钮失败
- 新骑手仍可正常接单

### admin 派单 / 改派
- 首次派单能写入当前轮元数据
- 改派能立即让旧骑手失效
- 拒单会立即自动续派
- 超时会自动续派
- 无下一个骑手时不会错误推进到 `delivering`

### rider dashboard
- 当前骑手显示 `接单 / 暂不接单`
- 旧骑手显示 `已改派` 或 `接单超时`
- 失效卡片按钮为禁用态
- `delivering` 阶段仍只给当前配送骑手显示 `送餐完成`

## 最小实现边界

### 本轮要做
- 拒单立即续派
- 超时自动续派
- admin 改派让旧骑手立即失效
- Telegram 后端失效校验
- rider dashboard 失效状态展示
- 超时时间全局可配置，默认 5 分钟

### 本轮不做
- 不新增复杂订单主状态
- 不做多骑手并行抢单
- 不做复杂统计报表
- 不做每店独立超时策略
- 不做 master 侧大规模改版

## 推荐拆分
1. 扩展 `dispatch_meta` 与共享 helper
2. 改 Telegram callback 的失效校验
3. 改 admin 派单 / 改派 / 自动续派主流程
4. 改 rider dashboard 失效展示
5. 补全回归测试
