# Master Telegram Test Button Design

**Goal:** 在 master 的 MQTT / Telegram 配置卡片里增加一个“发送测试消息”按钮，直接验证全局 Telegram Bot Token 与 Chat ID 是否可用，不再依赖下单或派单流程。

**Why:** 当前排查 Telegram 无消息时，业务链路过长（下单 → 派单 → 本地 API → 全局配置 → Telegram API）。需要一个最短闭环，把问题先收敛到“全局 Telegram 通道是否能发”。

## Scope

本次只解决“全局 Telegram 通道测试”这一个问题：
- 在 master settings 中新增测试按钮
- 新增一个本地 API route 发送测试消息
- 明确显示成功或失败原因

不包含：
- 骑手定向测试
- admin 页面测试按钮
- 真实订单广播逻辑调整
- 后端 Go 服务改动

## UI Design

### Placement

位置：`src/components/master/MasterServerSettingsCard.astro`

在现有操作区中保留：
- 保存 MQTT / Telegram 配置

并新增：
- 发送测试消息

继续复用现有反馈区：
- `#master-server-settings-feedback`

### Interaction

点击“发送测试消息”时：
1. 从当前表单输入框读取：
   - `telegramBotToken`
   - `telegramChatId`
2. 调用本地 `POST /api/master/telegram-test`
3. 按钮进入 sending 状态并临时禁用
4. 根据响应更新反馈区文字

### Feedback Copy

成功：
- `测试消息已发送`

失败：
- `发送失败: telegram_bot_token_not_configured`
- `发送失败: telegram_chat_id_required`
- `发送失败: telegram_send_failed`
- 若 Telegram 返回了更具体错误，优先展示具体错误

## API Design

### Route

新增：`src/pages/api/master/telegram-test.ts`

### Request Body

```json
{
  "telegramBotToken": "123456:AA...",
  "telegramChatId": "-1001234567890",
  "text": "Master Telegram 测试消息"
}
```

### Request Source Rules

优先级：
1. 请求体里的 `telegramBotToken` / `telegramChatId`
2. 当前站内 master settings 中已保存的全局值

这样用户即使还没保存，也可以先测当前输入内容。

### Validation

服务端必须校验：
- 缺 token → `telegram_bot_token_not_configured`
- 缺 chatId → `telegram_chat_id_required`

### Telegram Call

服务端直接调用：
- `https://api.telegram.org/bot${token}/sendMessage`

payload：
```json
{
  "chat_id": "-1001234567890",
  "text": "Master Telegram 测试消息"
}
```

### Response Contract

成功：
```json
{
  "success": true,
  "ok": true,
  "result": { "message_id": 123 }
}
```

失败：
```json
{
  "success": false,
  "error": "telegram_bot_token_not_configured"
}
```

或：
```json
{
  "success": false,
  "error": "telegram_send_failed",
  "telegram_status": 400,
  "telegram_response": { ... }
}
```

## Implementation Notes

### Frontend

优先复用 master 现有 settings 提交脚本，不新建无必要抽象。

前端只做三件事：
1. 读取表单输入值
2. 发起 POST
3. 更新 feedback 与按钮 loading 状态

### Backend

`/api/master/telegram-test` 只负责测试发送，不写入 settings，不修改任何业务状态。

如果请求体未带 token/chatId，需要读取当前站内 master settings；读取方式应复用当前项目中已有的 master settings 读取约定，避免再造一套配置源。

## Error Handling

只处理真实边界错误：
- 请求体不是合法 JSON
- token/chatId 缺失
- Telegram API 返回失败
- Telegram API 网络异常

不引入额外兜底逻辑或多余配置项。

## Files

预计涉及：
- Modify: `src/components/master/MasterServerSettingsCard.astro`
- Modify: master settings 对应前端脚本（以现有绑定文件为准）
- Create: `src/pages/api/master/telegram-test.ts`
- Create/Modify: 对应测试文件

## Testing

至少覆盖：

1. API：缺 token 返回明确错误
2. API：缺 chatId 返回明确错误
3. API：Telegram 成功时返回 success
4. API：Telegram 失败时返回结构化错误
5. 组件源码：包含测试按钮与反馈更新逻辑

## Deployment Impact

本设计只改前端 Astro/BFF 层：
- 不改 Go 后端
- 不需要上传 VPS
- 不需要重启后端服务

## Self-Review

- 无占位符
- 范围单一，聚焦 master 全局 Telegram 通道测试
- UI、API、反馈与测试策略一致
- 未混入骑手测试或业务派单改造
