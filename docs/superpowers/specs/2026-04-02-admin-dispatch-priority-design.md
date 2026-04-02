# Admin Dispatch Priority Design

**Goal:** 让 admin 成为第一派单入口，支持广播通知、手动指派、自动派单；master 只保留全局调度和兜底角色，同时修复“骑手只有在 master 指派后才能看到订单”的现状。

**Scope:** 本轮只覆盖 admin/master/rider 的派单链路、订单状态流、骑手可见性与自动派单轮询；不顺带重做支付、订单编辑、商家自定义骑手体系或 Telegram Bot 整体架构。

## Background

当前派单链路有三个问题叠在一起：

1. admin 是最早看到新外卖订单的位置，但并没有完整派单权限
2. rider 端的可见性与“已写入具体 courier 归属”耦合，导致仅广播但未指派的订单对骑手端近似不可见
3. `master?tab=dispatch` 本应承担默认轮流派单，但用户反馈该能力目前失效，实际操作上必须先去 master 手动指派，商家侧无法闭环

因此问题不是单个 bug，而是入口优先级和职责边界错位：
- admin 看到订单最早，却只能做部分动作
- master 有调度能力，却不应是店内默认入口
- 广播、指派、自动派单三件事目前语义混杂

## Design Decision

采用“**admin 主派单入口 + 共享指派服务 + master 兜底**”方案：

1. admin 成为默认派单入口
2. 将“广播通知”“手动指派”“自动派单”拆成三条明确动作
3. 自动派单从 master 页面脚本下沉到共享服务/API，admin 与 master 共用
4. rider 端拆分为“待接单池”和“我的配送”两种可见性
5. master 继续保留跨店调度和人工兜底，但不再是默认派单主路径

## Product Rules

### 入口优先级
- 新订单默认由 admin 处理
- master 只用于跨店总控、异常兜底、人工干预
- 现有 master 轮流派单被视为失效能力，本轮以共享自动派单能力替代其主流程地位

### 三个动作的业务语义

#### 1. 广播通知
- 订单进入 `awaiting_courier`
- 广播给在线骑手
- 不写具体 `courier_name/courier_phone`
- rider 端的“待接单池”必须可见

#### 2. 手动指派
- admin 只可从在线骑手中选择
- 选中后立即写入具体骑手归属
- 订单进入 `delivering`
- 向目标骑手发送定向通知

#### 3. 自动派单
- admin 可直接触发
- 后端从当前在线骑手池按轮询规则选下一位
- 指派成功后与手动指派走同一条最终写单逻辑
- 不再依赖 master 页面触发默认轮询

## Order State Model

统一使用以下配送状态语义：

- `pending`：待处理
- `confirmed`：已接单，待进入配送流程
- `awaiting_courier`：已广播，等待骑手接单或等待系统/商家最终指派
- `delivering`：已指派给具体骑手，配送中
- `completed`：已完成

明确规则：

### `awaiting_courier`
- 允许广播但尚未归属具体骑手
- admin 显示中文“待骑手接单”
- rider 端待接单池可见
- 不应要求 `courierPhone/courierName` 才可见

### `delivering`
- 必须已经写入具体骑手归属
- rider 端“我的配送”只看这一类订单
- 已归属给别人的订单，不应进入当前骑手的“我的配送”

## Rider Visibility Model

这是本轮最关键的行为修正。

### 待接单池
新增或明确一块 rider 列表，面向在线骑手展示：
- 状态为 `awaiting_courier`
- 展示店铺、地址、金额、可取时间等必要信息
- 这是广播后订单的默认可见入口

### 我的配送
继续展示：
- 状态为 `delivering`
- 且订单归属匹配当前骑手

### 明确禁止的旧逻辑
不能再仅依赖以下条件判断 rider “是否有单”：
- `status === delivering`
- 或仅匹配 `courierPhone`

否则广播成功但未归属的订单仍会在 rider 端消失。

## Architecture

### 1. UI 层

#### admin
`src/components/admin/TabTables.astro`
- 在外卖卡片增加：
  - `通知骑手`
  - `指派骑手`
  - `自动派单`
- `delivering` 状态显示已指派骑手信息
- 已指派后不再显示“自动派单”

`src/scripts/admin/order-actions.ts`
- 负责触发三个动作
- 拉在线骑手列表
- 打开轻量选择交互
- 调用对应 API
- 成功后刷新当前订单卡片状态

#### master
`src/scripts/master/dispatch-actions.ts`
- 改为复用共享 assign API
- 保留总控/兜底动作
- 不再维护独立轮询算法

`src/pages/master/index.astro`
- 不新增重逻辑，仅保留已有装配职责

### 2. 共享服务层

建议收口为两类共享能力：

`src/lib/rider-dispatch.ts`
- 负责广播/提醒相关逻辑
- 管理 Telegram 广播摘要
- 不负责最终选择哪位骑手

`src/lib/rider-assignment.ts`
- 负责：
  - 在线骑手选择
  - 轮询计算下一个骑手
  - 组装最终订单更新 payload
  - 指派后的定向通知触发
- admin 与 master 都只调用这一层

### 3. API 层

#### 继续保留：`src/pages/api/admin/rider-dispatch.ts`
动作仅保留广播语义：
- `publish`
- `remind`

职责：
- 更新订单为 `awaiting_courier`（如适用）
- 记录广播时间、提醒次数
- 向在线骑手广播消息
- 返回广播统计结果

#### 新增：`src/pages/api/admin/rider-assign.ts`
支持：
- `manual_assign`
- `auto_assign`

职责：
- 校验在线骑手
- 选择目标骑手
- 更新订单为 `delivering`
- 写入 `courier_name/courier_phone`
- 向目标骑手发送定向通知

## Auto Assignment Strategy

自动派单必须在服务端完成，不能依赖前端页面状态。

### 轮询规则
- 只在在线/可接单骑手中选择
- 对骑手列表做固定排序
- 按店铺维度记录最近一次派给谁
- 下一单从下一位骑手开始
- 若上一位已离线，则顺延到下一个在线骑手
- 无在线骑手时返回 `no_available_riders`

### 轮询状态
至少需要持久化：

```ts
{
  shopId: string | number,
  lastAssignedRiderId: string | number,
  updatedAt: string,
}
```

这份状态必须在服务端保存，不能放浏览器端，以避免多个 admin 页面同时操作导致乱序。

## Error Handling

### 广播通知
- 允许“订单状态进入 `awaiting_courier` 成功，但 Telegram 部分失败”
- 返回里明确区分：
  - 订单已进入待派单
  - 通知成功/失败数量
- 不因部分通知失败而回滚订单状态

### 手动指派
常见失败场景：
- 目标骑手刚离线
- 订单已被其他操作先一步指派
- 订单状态已不允许再派单
- 店铺上下文失效

要求：
- 返回明确失败原因
- 不用模糊 toast 覆盖具体问题

### 自动派单
需区分：
- 选人失败（如无在线骑手）
- 订单更新失败
- 定向通知失败

只要订单已成功写入具体骑手归属，就不能因通知失败把订单回滚成未派单。

## File Changes

### Create
- `src/lib/rider-assignment.ts`
  - 共享手动/自动指派逻辑
- `src/tests/pages/api/admin-rider-assign.test.ts`
  - 覆盖 manual_assign / auto_assign 主要分支

### Modify
- `src/components/admin/TabTables.astro`
  - 增加指派骑手、自动派单按钮与已归属显示
- `src/scripts/admin/order-actions.ts`
  - 增加 admin 侧手动/自动派单动作
- `src/pages/api/admin/rider-dispatch.ts`
  - 收口为纯广播/提醒语义
- `src/scripts/master/dispatch-actions.ts`
  - 改为复用共享 assign API
- `src/pages/api/rider/status.ts`
  - 如有必要，补齐待接单池所需过滤数据
- rider dashboard 相关页面/脚本
  - 明确拆分待接单池与我的配送

### Existing tests to update
- `src/tests/pages/api/admin-rider-dispatch.test.ts`
- rider dashboard / rider status 相关测试
- admin delivery cards 相关测试

## Testing Plan

必须覆盖：

### 1. 广播链路
- 广播成功
- 部分 Telegram 失败
- 无在线骑手
- `awaiting_courier` 仍正确落库

### 2. 手动指派链路
- 选择在线骑手后成功进入 `delivering`
- 写入 `courier_name/courier_phone`
- 向目标骑手发送定向通知
- 目标骑手离线时明确失败

### 3. 自动派单链路
- 存在多个在线骑手时按轮询前进
- 上一次骑手离线时自动顺延
- 无在线骑手时返回 `no_available_riders`
- 指派成功但通知失败时不回滚归属

### 4. rider 可见性
- `awaiting_courier` 出现在待接单池
- `delivering` 出现在我的配送
- 未归属订单不误入我的配送
- 已归属给别人的订单当前骑手不可见

### 5. admin UI
- 外卖卡片显示三个动作按钮
- `awaiting_courier` 继续显示中文“待骑手接单”
- 指派成功后显示已归属骑手信息

## Acceptance Criteria

完成后必须满足：

- admin 成为商家默认派单入口
- admin 可直接执行广播、手动指派、自动派单
- 自动派单不再依赖 master 页面触发
- rider 端能看到广播后的 `awaiting_courier` 订单
- rider “我的配送”只显示已归属给自己的 `delivering` 订单
- master 继续保留总控/兜底能力，但不是主入口
- 广播、指派、自动派单三种动作的返回与错误语义清晰分离

## Non-Goals

以下不在本轮内：
- 重做 Telegram Bot 整体消息模板
- 新增复杂骑手绩效、负载均衡、距离算法
- 把商家自定义骑手并入 master 管理
- 重构整个订单 DTO 或支付链路
- 实现完整“骑手自主抢单”产品闭环（本轮只确保广播态可见性和后续承接能力）
