# 2026-03-12 前端止血：敏感配置清理 + 安全 DOM 渲染（design）

## 背景
该项目为两部分系统：
- 前端：`meituanAstro/`（Astro + Preact），本地使用 `pnpm run dev`，推送 GitHub 后部署到 Cloudflare。
- 后端：`meituanGo/`（Go + Gin），通过 SFTP 部署到 VPS，对外 API base 为 `https://api.serbia70.com/`。

本设计的范围 **仅覆盖前端止血（meituanAstro）**，并明确边界以避免误删/误改仓库结构。

## 目标（P0）
1. **敏感信息止血**：前端仓库与前端部署（Cloudflare）中不再包含任何可用的高权限凭据（master token / MQTT 账号密码）。
2. **DOM XSS 面清零**：前端业务代码中危险 DOM API 归零（`innerHTML`/`insertAdjacentHTML`/`outerHTML`/`document.write`/`dangerouslySetInnerHTML`）。
3. **可回归验证**：引入/强化自动化检查，防止危险 DOM API 与敏感配置回流。
4. **低风险、可回滚**：以“最小行为变更”为原则，修改按页面/模块分步落地，保证 `pnpm run dev`、`pnpm run build` 可验证。

## 非目标（本轮不做）
- 不进行大规模 UI/架构重写。
- 不做前后端协议大改（除非为移除前端万能 token 需要最小配合，且另起 spec）。
- 不做后端大范围重构与清理。

## 安全硬规则（必须满足）
### A. 危险 DOM API 禁止清单
- 禁止：`innerHTML`、`insertAdjacentHTML`、`outerHTML`、`document.write`、`dangerouslySetInnerHTML`
- 原则：
  - 文本使用 `textContent`
  - 结构使用 `document.createElement` + `append` / `replaceChildren`
  - 属性使用 `setAttribute`

### B. 敏感配置策略
- **前端（仓库 + Cloudflare 前端环境 + 浏览器）不再持有**：
  - master token
  - MQTT username/password
- 浏览器侧仅允许使用非敏感公开配置：`PUBLIC_API_URL`（指向后端 base URL）。
- 任何需要“特权”的能力（如 master 管理）必须转移到后端鉴权链路完成；前端不得通过“万能 token”直连后端做特权操作。

> 线上动作（非代码）：按“已泄露”标准轮换 master token、MQTT 账号密码。

## 执行范围与边界（避免误删/误提交）
由于当前 worktree 显示仓库根目录存在大量 tracked 文件的删除/迁移迹象，本轮清理严格限定：
- **仅在 `meituanAstro/` 内做修改**（以及必要的忽略规则/日志治理）。
- “删除无效代码”只删除：
  1) 明确日志/临时产物；
  2) 由构建可再生成且对运行不必要的文件；
  3) 经 `pnpm run build` 验证不影响产物。
- 仓库结构层面的“根目录大规模删改”不在本轮自动执行；如需要迁移/收敛仓库结构，另起设计与验证。

## 方案（采用）
采用“止血 + 最小行为变更”方案：
1) 凭据治理止血：从仓库与 CF 前端环境移除敏感值；清理日志并完善 `.gitignore`。
2) 危险 DOM API 归零：全仓扫描并替换为安全 DOM 渲染。
3) 防回归：将危险 DOM API 检查脚本纳入常规测试链路（本地可跑，CI 可选）。

## 验收标准
- `meituanAstro` 仓库内与构建产物中不包含 master/MQTT 真实凭据。
- 全仓扫描 `meituanAstro`：危险 DOM API 为 0（允许测试/检查脚本中出现用于检测的字符串，但业务代码为 0）。
- `pnpm run dev` 可运行，核心页面可用（至少覆盖你当前关注的 `/admin/02` 相关路径）。
- `pnpm run build` 通过。

## 回滚策略
- 以页面/模块为单位提交；若出现行为偏差，可回滚到替换前的单个 commit。
- 配置治理与线上轮换需配套：仓库移除只是止血；轮换才是根治。
