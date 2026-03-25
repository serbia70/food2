# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 路径入口
- `README.md` — 项目总览、本地开发、部署说明
- `DEPLOY.md` — Cloudflare Pages 部署细节
- `docs/` — 长文档、说明、背景材料
- `docs/superpowers/specs/` — 设计文档
- `docs/superpowers/plans/` — 实施计划

## 1. 通用指令（强制使用 pnpm）
- 安装依赖: `pnpm install`（本项目依赖 `pnpm-lock.yaml`）
- 本地开发: `pnpm dev`（默认端口 3000）
- 开发重置: `pnpm run dev:force` 或 `pnpm run dev:reset`（清理缓存并重启）
- 构建: `pnpm build`
- 预览: `pnpm preview`
- 部署: `pnpm exec wrangler pages deploy dist`

## 2. 安全与测试
- 运行完整测试套件: `pnpm run test:security`
- 运行单个测试: `node --test <路径>`（如 `src/lib/master-auth.test.ts`）
- 注意: 部分安全测试需在 `pnpm build` 后才能通过

## 3. 技术架构与规范
- 运行环境: Astro (`output: "server"`) + Cloudflare Pages/Workers + Preact Islands
- `src/pages/[slug]/index.astro`: 公共店铺页（菜单、PWA、MQTT/EventSource 实时通信）
- `src/pages/admin/[slug]/index.astro`: 店铺管理后台（Cookie 认证、订单/账单管理）
- `src/pages/master/index.astro`: 全局控制台（备份、设置、全局管理、店铺操作）
- `src/pages/api/**`: BFF/代理路由（处理 Auth、转发 API 请求）
- `src/components/**`: UI 组件与 Preact islands
- `src/lib/**`: 共享业务逻辑、状态、归一化与测试
- `src/config.ts`、`src/lib/clientConfig.ts`: 运行时配置，使用静态 `import.meta.env`
- `src/lib/clientConfig.ts` 还读取 `PUBLIC_DEFAULT_USER_PASSWORD`、`PUBLIC_CART_SUPPRESS_RELOAD_MS`、`PUBLIC_API_PROXY_TIMEOUT_MS`
- `PUBLIC_*` 变量是浏览器可见的，严禁放入密钥
- Admin/master 认证依赖 HttpOnly cookie + proxy helpers 转发 `Authorization`
- 浏览器运行时代码不要使用 Node.js 特有 API；只放在 `scripts/` 和测试里

## 4. 编码准则
- 保持简洁、去重，优先复用现有模块
- 有明显死代码就清理，不要堆叠无用分支
- 修改后优先用现有测试/构建命令验证
- 沟通简练，直接给结论和方案
- 提交时遵循 Conventional Commits（feat、fix、refactor 等）
