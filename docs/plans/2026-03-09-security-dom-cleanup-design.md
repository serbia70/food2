# Security DOM Cleanup Design

## 背景

当前 `meituanAstro` 里仍有较多基于字符串拼接的 `innerHTML` 渲染，混合了接口返回值、用户输入和动态业务数据。虽然其中一部分场景暂时没有直接形成可利用漏洞，但这类写法会放大 XSS、属性注入、事件注入和回归修改风险。

同时，后台登录接口仍把 `token` 返回给前端响应体，和当前基于 HttpOnly Cookie 的会话模型不一致，增加了前端误用和泄露面。

## 目标

本轮按“先安全、后收口”的策略推进：

1. 先处理高风险动态 DOM 渲染，优先覆盖后台页 `\/admin\/02` 会触发的路径。
2. 修复管理登录接口的 token 暴露问题。
3. 顺手清理一批明显重复、脆弱或易错的渲染逻辑，让后续修改更不容易引入回归。

## 范围

本轮优先覆盖：

- `src/pages/api/admin/login.ts`
- `src/pages/shop.astro`
- `src/components/UserChat.astro`
- `src/pages/user/index.astro`
- `src/scripts/admin/settings-ui.ts`
- `src/scripts/shop/table-details.ts`
- `src/scripts/admin/order-actions.ts`
- `src/scripts/admin/table-management.ts`

后端 `meituanGo` 本轮以安全边界扫描为主，不做大规模重构。

## 方案

### 1. 登录安全收口

- `POST /api/admin/login` 登录成功后仅设置 `admin_token` Cookie。
- 响应体只返回 `{ success: true }`。
- `secure` 属性按环境决定，避免本地开发无法写 Cookie，也避免生产明文传输。

### 2. 安全 DOM 渲染

- 对纯文本内容统一使用 `textContent`。
- 对动态列表统一改为 `createElement`、`append`、`replaceChildren`。
- 对必须保留换行展示的内容，通过拆分文本节点和 `<br>` 节点实现，而不是拼接 HTML。
- 空态、错误态、加载态统一通过小型 helper 节点渲染，减少散落字符串模板。

### 3. 低风险结构收口

- 在局部文件内抽小 helper，避免为了这轮清理引入大规模架构迁移。
- 保持现有业务行为、接口路径、样式类名和事件入口不变。
- 只删除明显重复或无效代码，不做跨域大重写。

## 风险控制

- 不改变后端接口协议，除登录响应移除 `token` 外不主动改业务契约。
- 不一次性清空所有 `innerHTML`；优先改高风险动态路径，低风险静态模板留待后续分波处理。
- 每个改动点都保持页面结构和选择器兼容，避免影响现有点击代理和样式。

## 验证

- `pnpm run build`
- `pnpm run dev`
- 打开 `http://localhost:3000/admin/02`
- 打开前台聊天、用户中心头像、点餐页、桌台详情等关键路径做 smoke check
