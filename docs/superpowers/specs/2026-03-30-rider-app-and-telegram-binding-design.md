# Rider App and Telegram Binding Design

**Goal:** 补齐一个完整可用的骑手端，基于现有手机号+密码体系支持登录、状态切换、待接/配送中订单查看与接单，同时新增骑手自助 Telegram 绑定能力，让后台派单通知真正可达。

**Architecture:** 继续复用现有 `/rider/*` 页面与 `/api/rider/auth`、`/api/rider/status`、`/api/rider/orders`、`/api/order/update_status` 这些已存在的接口契约，在此基础上补齐缺失的会话、绑定和状态展示链路。新增一条最小 Telegram 绑定链路：骑手端生成绑定入口，Telegram 回调写入骑手 `telegram_chat_id`，后台与派单逻辑继续直接消费这个真实字段，不引入第二套骑手通知数据源。

**Tech Stack:** Astro server routes, Preact/inline browser scripts, existing rider/admin BFF routes, Telegram bot callback flow, existing upstream rider/order APIs.

---

## 1. 当前状态与问题

当前仓库里已经有骑手相关入口，但还是半成品：

- `src/pages/rider/login.astro` 已有手机号+密码登录页，但只是把 `data.rider` 塞进 `localStorage`，没有真正的会话设计。
- `src/pages/rider/register.astro` 已有注册页。
- `src/pages/rider/dashboard.astro` 已有基础订单列表、状态切换、接单/完成功能，但没有 Telegram 绑定区块，也没有围绕绑定状态的交互。
- 管理后台与派单逻辑已经把 `telegram_chat_id` 当作真实通知开关：
  - `src/pages/api/admin/rider-dispatch.ts`
  - `src/scripts/admin/settings-ui.ts`
- 但仓库里没有骑手自助绑定 Telegram 的入口，也没有把 Telegram chat_id 写回骑手资料的完整实现。

因此现在的断点不是“通知骑手逻辑坏了”，而是“产品要求骑手必须绑定 Telegram，但产品没有提供绑定路径”。

---

## 2. 范围

本次只做一个单独可落地的子项目：**完整骑手端 + Telegram 绑定**。

### 包含

1. 骑手手机号+密码登录/注册沿用现有接口。
2. 补齐一个真正可用的骑手 dashboard。
3. 支持骑手状态切换：`available` / `busy` / `offline`。
4. 支持查看：
   - 可抢订单
   - 我配送中的订单
   - 已完成订单
5. 支持接单、送达。
6. 支持骑手自助绑定 Telegram。
7. 后台继续直接读取真实骑手数据源，不再造中间同步层。

### 明确不做

1. 多账号/多设备会话管理。
2. Telegram 换绑/解绑后台工具。
3. 短信验证码登录。
4. 新建独立骑手后端体系。
5. 推送历史、消息中心、绩效统计。

---

## 3. 推荐方案

采用**在现有 `/rider/*` 基础上补完整骑手端 + 新增最小 Telegram 绑定链路**。

不新开独立骑手前端，不改认证体系，不让后台手工录 `chat_id`。

原因：

- 现有代码已经有 `/rider/login`、`/rider/register`、`/rider/dashboard`、`/api/rider/auth`、`/api/rider/status`、`/api/rider/orders`，直接补齐性价比最高。
- 派单端已经稳定依赖 `telegram_chat_id`，最稳的是把这个字段真实写到骑手资料上，而不是另加映射表。
- 用户已经确认要“完整版骑手端”，但登录方式仍沿用手机号+密码，所以没必要重做认证体系。

---

## 4. 用户流

### 4.1 骑手登录流

1. 骑手打开 `/rider/login`。
2. 输入手机号和密码。
3. 通过现有 `/api/rider/auth` 登录。
4. 前端保存骑手身份并跳转 `/rider/dashboard`。
5. Dashboard 首屏显示：
   - 骑手姓名
   - 当前状态
   - Telegram 绑定状态
   - 待接/配送中订单

### 4.2 骑手接单流

1. 当状态为 `available` 时，骑手端可看到待接订单。
2. 点击“接单配送”。
3. 通过现有订单更新链路把订单置为 `delivering`，并写入 `courier_name` / `courier_phone`。
4. 接单成功后该订单进入“配送中”。

### 4.3 骑手送达流

1. 骑手在配送中订单卡片点击“确认送达”。
2. 调现有订单更新链路，把订单改为 `completed`。
3. 刷新列表。

### 4.4 Telegram 绑定流

1. 骑手在 dashboard 看到“Telegram 未绑定”。
2. 点击“绑定 Telegram”。
3. 页面生成带签名/一次性上下文的 Telegram deep link，跳去机器人。
4. 骑手在 Telegram 中完成一次交互。
5. Telegram 回调本地绑定接口。
6. 后端根据绑定上下文把当前 Telegram `chat_id` 写入该骑手资料。
7. dashboard 刷新后显示“Telegram 已绑定”。
8. 管理后台骑手管理区同步显示“已绑定”，该骑手开始满足派单条件。

---

## 5. 页面与组件设计

### 5.1 登录页 `src/pages/rider/login.astro`

保留现有页面骨架，但要补：

- 登录失败的清晰提示。
- 成功后使用统一的 rider session 存储结构，不再只盲存原始对象。
- 如果已登录，直接跳 dashboard。

### 5.2 注册页 `src/pages/rider/register.astro`

保留现有手机号+密码+姓名注册表单，不在注册页增加 Telegram 绑定字段。

原因：
- `telegram_chat_id` 不是表单输入项，必须来自 Telegram 回调。
- 注册页只做账号创建，绑定在登录后做，更符合真实流程。

### 5.3 Dashboard `src/pages/rider/dashboard.astro`

在现有基础上补成四块：

1. **骑手头部卡片**
   - 姓名
   - 手机号
   - 当前状态 badge
   - 退出登录

2. **状态操作区**
   - `available / busy / offline` 切换
   - 清晰解释：只有 `available` 才进入通知名单

3. **Telegram 绑定区**
   - 已绑定：显示“已绑定 Telegram”
   - 未绑定：显示“未绑定，无法接收送餐通知”
   - 按钮：`绑定 Telegram`

4. **订单区**
   - 待接单
   - 配送中
   - 已完成
   - 保持移动端优先

---

## 6. 接口设计

### 6.1 继续复用

- `/api/rider/auth`
- `/api/rider/status`
- `/api/rider/orders`
- `/api/order/update_status`

这些接口已存在，优先按现有契约复用，不重造。

### 6.2 新增接口：生成绑定入口

新增一个 rider API，例如：

- `POST /api/rider/telegram/bind`

作用：
- 接收当前骑手身份
- 生成短期有效绑定参数
- 返回 Telegram deep link

返回内容至少包含：
- `success`
- `bind_url`

### 6.3 新增接口：Telegram 绑定回调

新增一个 Telegram 回调路由，例如：

- `POST /api/telegram/rider-bind`

作用：
- 校验 Telegram 请求来源
- 校验绑定参数是否合法、未过期、未被重放
- 拿到 Telegram `chat_id`
- 把 `telegram_chat_id` 写到对应骑手

### 6.4 现有 `rider-claim` 的整理

当前已有：
- `src/pages/api/telegram/rider-claim.ts`

实现时应统一 Telegram 回调校验逻辑，避免绑定回调和抢单回调各写一套几乎相同的校验逻辑。可以共享：
- secret 校验
- rider 查找逻辑
- Telegram chat_id 读取逻辑

---

## 7. 数据设计

目标仍然是直接使用骑手真实字段：

- `id`
- `name`
- `phone`
- `status`
- `telegram_chat_id`

不新增“骑手 Telegram 绑定表”作为第一版方案。

原因：
- 当前派单逻辑已经直接读 `telegram_chat_id`
- 后台骑手管理也直接展示这个字段
- 第一版只需要把这个字段正确写进去，就能贯通整条链路

如后续需要支持绑定历史、解绑审计，再考虑拆独立表。

---

## 8. 会话与安全

### 8.1 骑手会话

当前 dashboard 直接读 `localStorage.rider_token`。这一版可以先延续轻量方案，但要把它收敛为明确的 rider session 数据结构，并在以下场景做保护：

- session 不存在：跳登录页
- session 缺字段：清空并跳登录页
- rider phone 缺失：不允许拉订单

如果现有 `/api/rider/auth` 已返回足够字段，第一版不强行引入 HttpOnly cookie，会尽量保持改动最小。

### 8.2 Telegram 绑定安全

绑定链路不能只靠“骑手点了按钮”来信任绑定，必须至少满足：

- 绑定参数短期有效
- 参数带签名，防伪造
- 一次性使用，防重放
- 回调必须校验 Telegram secret

这样才能避免别人伪造 chat_id 绑定到别的骑手。

---

## 9. 管理后台联动

管理后台现有逻辑基本可以保留：

- `src/scripts/admin/settings-ui.ts` 继续展示 available 骑手列表
- `src/pages/api/admin/rider-dispatch.ts` 继续基于 `telegram_chat_id` 过滤可通知骑手

只需要补两点：

1. 文案更明确：
   - 未绑定 Telegram 时明确告诉商家“需要骑手先去骑手端完成绑定”
2. 骑手端完成绑定后，后台刷新即可看到状态变化

不新增后台手工编辑 `chat_id` 入口。

---

## 10. 错误处理

### 骑手端

- 未登录：跳登录页
- 订单加载失败：列表内错误提示
- 状态切换失败：toast/alert 提示，不假装成功
- 绑定失败：明确提示“绑定失败，请重试”

### Telegram 绑定回调

- secret 不合法：401
- 绑定参数无效/过期：400
- rider 不存在：404/400
- chat_id 已绑定他人：返回明确错误

### 后台派单

- `available > 0` 但 `telegramBoundCount = 0`：继续明确提示“0 位已绑定 Telegram 骑手，未发送通知”

---

## 11. 测试要求

至少覆盖：

1. 骑手登录成功/失败
2. rider dashboard 在 session 缺失时跳转
3. 状态切换到 `available` 后，后台可见
4. `/api/rider/orders` 在不同 view 下返回正确列表
5. Telegram 绑定参数生成与校验
6. Telegram 回调成功写入 `telegram_chat_id`
7. 已绑定骑手能进入派单候选
8. 未绑定骑手不会收到通知
9. 接单时并发竞争下，已被他人接走会给出明确提示

---

## 12. 成功标准

上线后必须满足：

1. 骑手可以注册、登录、进入 dashboard。
2. 骑手可以切换 `available / busy / offline`。
3. 后台骑手管理能看到真实 available 状态。
4. 骑手可以在 dashboard 完成 Telegram 绑定。
5. 绑定成功后，后台显示“Telegram 已绑定”。
6. 商家点击“通知骑手”时，已绑定且 available 的骑手能收到 Telegram 通知。
7. 骑手能看到待接订单并接单。
8. 骑手接单后订单进入 `delivering`。
9. 骑手确认送达后订单进入 `completed`。

---

## 13. 实施顺序建议

1. 先收敛 rider dashboard 会话与状态区。
2. 再补订单列表/接单流，保证骑手端基本可用。
3. 然后补 Telegram 绑定入口与回调。
4. 最后做后台联动验证和文案收口。

这样即使 Telegram 绑定尚未完成，骑手端主体也已经可用，不会把所有风险压到最后一步。