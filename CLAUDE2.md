# 项目核心指引 (CLAUDE.md)

本文件指导 Claude Code 在本仓库进行开发、测试与部署。

## 1. 通用指令 (强制使用 pnpm)
- 安装依赖: `pnpm install` (本项目依赖 pnpm-lock.yaml)
- 本地开发: `pnpm dev` (默认端口 3000)
- 开发重置: `pnpm run dev:force` 或 `pnpm run dev:reset` (清理缓存并重启)
- 构建与部署: `pnpm build` -> `pnpm preview` -> `pnpm exec wrangler pages deploy dist`

## 2. 安全与测试
本项目采用 Node 内置测试运行器进行安全门控：
- 运行完整测试套件: `pnpm run test:security`
- 运行单个测试: `node --test <路径>` (如 `src/lib/master-auth.test.ts`)
- **注意**: 部分安全测试需在 `pnpm build` 后才能通过。

## 2.1 Lint
- 当前没有专用 lint script；如果后续新增，请在这里补上。

## 3. 技术架构与规范
- **运行环境**: Astro (`output: "server"`) + Cloudflare Pages/Workers + Preact Islands (交互 UI)。
- **路由结构**:
  - `src/pages/[slug]/`: 公共店铺页 (菜单、PWA、MQTT/EventSource 实时通信)。
  - `src/pages/admin/[slug]/`: 店铺管理后台 (Cookie 认证、订单/账单管理)。
  - `src/pages/master/`: 全局控制台 (备份、设置、全局管理)。
  - `src/pages/api/**`: BFF 代理路由 (处理 Auth、转发 API 请求)。
- **状态管理**: 核心逻辑位于 `src/lib/` (如 `api-proxy`, `userStore`, `user-auth`)。
- **环境配置**:
  - 浏览器端变量定义在 `src/config.ts` 和 `src/lib/clientConfig.ts` (通过 `import.meta.env` 访问)。
  - `src/lib/clientConfig.ts` 还读取 `PUBLIC_DEFAULT_USER_PASSWORD`、`PUBLIC_CART_SUPPRESS_RELOAD_MS`、`PUBLIC_API_PROXY_TIMEOUT_MS`。
  - Cloudflare 变量位于 `wrangler.toml` 的 `[vars]`。
  - **严禁**将私钥/密钥泄露给 `PUBLIC_*` 变量。

## 4. 编码准则 (原则：稳健、简洁、无屎山)
- **拒绝冗余**: 代码必须简洁、无重复 (DRY)。若发现死代码，请主动清理。
- **逻辑隔离**: 严禁在浏览器端运行环境中使用 Node.js 特有 API (Node API 仅限 `scripts/` 和测试)。
- **安全性**: 优先执行防御性编程，确保代码在异常情况下稳健运行。
- **输出约束**: 
  - 沟通须简练，直接提供方案/代码，减少客套话。
  - 除非必要，无需询问，直接执行最佳实践。
  - 提交时遵循 Conventional Commits 规范 (feat, fix, refactor 等)。