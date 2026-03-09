# Chat Recovery MQTT Design

## 背景

当前项目后端聊天能力仍然存在：

- 用户侧接口：`/api/user/chat`
- 商家侧接口：`/api/admin/chat`
- `chat_messages` 表仍然存在
- Go 后端在消息写入后仍会发布 MQTT 聊天消息

但当前前端聊天功能缺失：

- `src/pages/messages/index.astro` 只是静态空页面
- `src/pages/user/service.astro` 只是静态按钮页
- admin 后台也没有实际挂载客户聊天 UI

因此问题不在后端，而在前端聊天页面、前端代理接口与 MQTT 客户端接线层缺失。

## 目标

恢复“商家与客户聊天”完整功能，并使用 MQTT 作为实时通道：

1. 用户进入 `/messages` 能看到与店铺的聊天记录并发送消息。
2. 商家在 admin 后台能看到客户聊天面板并回复消息。
3. 双方都先通过 HTTP 拉历史，再通过 MQTT 实时接收新消息。
4. 聊天恢复过程尽量复用现有后端接口与 MQTT 发布能力，不额外扩大协议面。

## 推荐方案

采用“完整恢复版 + MQTT 实时”方案。

### 为什么不选轮询版

- 虽然实现快，但体验差。
- 你已明确要求 MQTT。
- 后端已具备 MQTT 发布能力，不用重复造轮子。

### 为什么不直接做订单会话版

- 订单会话会显著增加 UI 和状态复杂度。
- 现有后端接口以 `shop_id + sender_phone` 为主要定位方式，更适合先恢复按店铺一对一聊天。
- 可以在恢复可用后，再升级为订单维度会话。

## 用户侧设计

### 页面结构

- `src/pages/messages/index.astro`
  - 作为聊天页面容器
  - 挂载用户聊天组件

- `src/components/UserChat.astro`
  - 负责：
    - 拉历史消息
    - 发送消息
    - 连接 MQTT
    - 渲染消息列表
    - 自动滚动到底部
    - 未登录状态提示

### 会话维度

首版按“当前店铺”做一对一聊天：

- 用户在店铺环境里进入消息页
- 会话以 `shop_id + sender_phone` 为键
- 先不做多订单分会话

### 数据流

- 历史消息：
  - `GET /api/user/chat?sender_phone=...&shop_id=...`
- 发送消息：
  - `POST /api/user/chat`
- 实时消息：
  - 订阅该用户对应的 MQTT 聊天通道

### 失败策略

- MQTT 连接失败时，不阻塞历史消息查看
- 页面仍保留手动刷新或轻轮询兜底

## 商家侧设计

### 后台挂载位置

在 admin 后台增加“客户聊天”面板，优先作为一个独立 tab 或内嵌在客户相关区域。

### 脚本结构

- `src/scripts/admin/user-chat.ts`
  - 拉取最近会话列表
  - 选择用户加载消息
  - 发送商家回复
  - MQTT 实时接收新消息
  - 新消息提示与标题提醒

### 商家端会话维度

首版按“用户手机号”聚合：

- 和现有后端接口兼容
- 易于恢复旧功能
- 后续再增加按订单细分的能力

## 前端 API 代理层

新增：

- `src/pages/api/user/chat.ts`
- `src/pages/api/admin/chat.ts`

用途：

- 统一前端域名下访问聊天接口
- 避免浏览器直接跨域访问后端
- 顺带纳入当前已建立的 `parseJsonBody / parseQuery / jsonError / proxyFetch` 模式

## MQTT 设计

### 基本原则

- HTTP 负责历史
- MQTT 负责实时
- MQTT 失败不影响聊天基础可用性

### 用户侧

- 页面初始化先拉历史
- 然后建立 MQTT 订阅
- 只把“对方发送的新消息” append 到当前消息流中

### 商家侧

- 后台加载最近会话用户列表
- 选中某个手机号后拉取历史
- 再监听对应聊天事件并实时刷新当前会话

## 文件规划

### 新增文件

- `src/pages/api/user/chat.ts`
- `src/pages/api/admin/chat.ts`
- `src/components/UserChat.astro`
- `src/scripts/admin/user-chat.ts`

### 修改文件

- `src/pages/messages/index.astro`
- `src/pages/user/service.astro`
- `src/components/admin/AdminScripts.astro` 或对应 admin tab 装配层
- 如有必要：`src/components/admin/AdminTabs.astro` / `src/components/admin/TabCustomers.astro`

## 验证标准

恢复完成后至少验证：

1. 用户能看到历史聊天记录。
2. 用户发送消息后，商家端能实时收到。
3. 商家发送消息后，用户端能实时收到。
4. MQTT 不可用时，历史加载和手动发送仍可工作。
5. `pnpm run build` 通过。

## 非目标

本轮不做：

- 多订单多会话完整体系
- 已读未读系统
- 聊天图片上传
- 聊天记录搜索

这些可以作为下一阶段增强项。
