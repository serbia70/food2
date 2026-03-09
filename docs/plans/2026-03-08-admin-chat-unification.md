# Admin Chat Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一 admin 后台当前订单、历史订单和客户列表的聊天入口，让所有聊天都复用同一个聊天面板与消息逻辑，减少重复实现和后续维护分叉。

**Architecture:** 以 `meituanAstro/src/scripts/admin/user-chat.ts` 作为唯一聊天实现，所有聊天入口统一调用 `openChatForPhone`。历史订单从“无电话 alert”改为真实聊天入口，客户页从“内嵌第二套聊天窗口”改为“联系人列表 + 打开统一聊天面板”，删除重复消息加载与发送逻辑。

**Tech Stack:** Astro, TypeScript, Preact, pnpm

---

### Task 1: 统一历史订单聊天入口

**Files:**
- Modify: `meituanAstro/src/components/admin/TabOrders.astro`
- Modify: `meituanAstro/src/scripts/admin/user-chat.ts`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. 历史订单聊天按钮当前只会 alert('聊天功能: 无电话/手机号')
2. 当前订单页已能调用 openChatForPhone 打开统一聊天面板
3. 目标是让历史订单与当前订单走同一入口
```

**Step 2: 修改历史订单按钮行为**

将：

```ts
alert('聊天功能: ' + (o.user_phone || '无电话'))
```

改为：

```ts
o.user_phone ? window.openChatForPhone(o.user_phone) : alert('无电话')
```

**Step 3: 保持无电话时的防御性行为**

要求：
- 没有 `user_phone` 时不打开空聊天
- 按钮仍可保留，但提示明确

**Step 4: 手工验证**

```text
1. 打开 /admin/01 的历史订单页
2. 选择一条有手机号的历史订单点击聊天
3. 确认打开统一聊天面板
4. 选择一条无手机号的历史订单点击聊天
5. 确认不会打开空面板，只提示无电话
```

---

### Task 2: 让客户列表改为统一聊天入口

**Files:**
- Modify: `meituanAstro/src/components/admin/TabCustomers.astro`
- Modify: `meituanAstro/src/scripts/admin/user-chat.ts`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. 客户页维护了第二套聊天 UI 和消息加载逻辑
2. 这套逻辑与 user-chat.ts 高度重复
3. 目标是保留客户列表，但点击客户时直接进入统一聊天面板
```

**Step 2: 精简客户页聊天区结构**

从客户页移除：
- 独立聊天 header
- 独立消息列表
- 独立发送输入框

保留：
- 客户列表
- 搜索
- 客户管理功能（积分、VIP、导出等）

**Step 3: 将客户选择改为统一入口**

客户列表项从：

```ts
selectChatCustomer(phone, name)
```

改为：

```ts
window.openChatForPhone(phone)
```

如需显示名字，可在 `user-chat.ts` 中允许传入可选 displayName，但不要新增第二套消息逻辑。

**Step 4: 删除重复聊天逻辑**

从 `TabCustomers.astro` 删除：
- `chatCurrentPhone`
- `loadChatMessages`
- `sendChatMessage`
- 相关 DOM 渲染代码

要求：
- 删除后客户页仍可正常加载客户列表
- 不影响积分 / VIP / 导出功能

**Step 5: 手工验证**

```text
1. 打开 /admin/01 的客户页
2. 点击任意客户
3. 确认打开统一聊天面板
4. 在统一面板发送消息
5. 返回客户页确认客户列表、VIP、积分功能仍正常
```

---

### Task 3: 统一聊天面板展示细节

**Files:**
- Modify: `meituanAstro/src/scripts/admin/user-chat.ts`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. 当前统一聊天面板以手机号为主标识
2. 客户页切过去后，至少要保证用户知道当前正在和谁聊天
```

**Step 2: 收口标题展示逻辑**

要求：
- 默认显示手机号
- 如果有名字信息，可显示 `名字 (手机号)`
- 不新增第二套状态源，避免复杂化

**Step 3: 保持消息加载与发送 API 不变**

继续统一使用：

```ts
GET /api/admin/chat?user_phone=...
POST /api/admin/chat
```

**Step 4: 手工验证**

```text
1. 当前订单、历史订单、客户页三处点击聊天
2. 都进入同一个聊天面板
3. 标题、消息列表、发送行为一致
4. MQTT 新消息提醒仍正常
```

---

### Task 4: 删除重复入口后的回归验证

**Files:**
- Modify: `docs/plans/2026-03-08-admin-chat-unification.md`

**Step 1: 运行前端验证**

```bash
pnpm run build
```

Expected: 前端构建通过。

**Step 2: 手工验证三条聊天入口**

```text
1. 当前订单聊天入口可打开统一面板
2. 历史订单聊天入口可打开统一面板
3. 客户页点击客户可打开统一面板
4. 发送消息成功
5. 没手机号时不打开空聊天
```

**Step 3: 记录结果**

在文档末尾补充：
- 已删除的重复逻辑
- 仍保留的唯一聊天实现文件
- 后续若继续重构应只改 `user-chat.ts`
