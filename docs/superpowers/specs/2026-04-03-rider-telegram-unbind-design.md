# Rider Telegram 解绑设计

**目标**
在骑手端 `src/pages/rider/dashboard.astro` 已绑定状态下提供“解除 Telegram 绑定”入口，点击后仅解除当前骑手自己的 Telegram 绑定，并立即回显为未绑定状态，便于立刻重新测试绑定流程。

## 范围
- 只做单个当前骑手解绑
- 入口只放在骑手端
- 不改 admin/master
- 不做 Telegram 机器人命令解绑

## 方案

### 1. 骑手端入口
在 `src/pages/rider/dashboard.astro` 的 Telegram 绑定面板中：
- 未绑定：保持现有“绑定 Telegram”流程
- 已绑定：显示“解除 Telegram 绑定”按钮
- 点击后先确认，再发起解绑请求
- 请求成功后立即清空本地 session 中的 `telegramChatId`
- 重新渲染绑定面板，文案立刻切回未绑定状态
- 给出简短成功提示，方便继续重绑测试

### 2. 服务端接口
新增 `src/pages/api/rider/telegram/unbind.ts`：
- 接收当前骑手 `riderId` 和 `riderPhone`
- 缺字段时返回 `rider_session_required`
- 通过现有后端 rider status 更新入口，把 `telegram_chat_id` 置空字符串
- 透传上游结果，成功时返回 `success: true`

### 3. 前端状态处理
前端解绑成功后不依赖重新登录：
- 直接把本地 `rider.telegramChatId` 清空
- 清空绑定过程缓存 `bindState`
- 重新调用现有 `renderTelegramBindingPanel()`
- 页面立即恢复为可重新绑定状态

### 4. 测试
- `src/tests/pages/api/rider-telegram-unbind.test.ts`
  - 校验成功时会向上游发送清空 `telegram_chat_id`
  - 校验缺少 rider 信息时返回 `rider_session_required`
- `src/tests/pages/rider-dashboard-canonical.test.ts`
  - 校验已绑定态存在解绑按钮
  - 校验前端会调用解绑逻辑
  - 校验成功后会清空 `telegramChatId`
  - 校验会重置 `bindState`

## 取舍
不复用通用状态更新按钮逻辑，不把解绑继续塞进 `updateStatus`，避免把骑手在线状态和 Telegram 绑定语义混在一起。解绑单独走 `/api/rider/telegram/unbind`，前后端职责更清楚，后续排查也更直接。
