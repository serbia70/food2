# 2026-03-12 前端止血：敏感配置清理 + 安全 DOM 渲染（design）

## 背景
该项目为两部分系统：
- 前端：`meituanAstro/`（Astro + Preact），本地使用 `pnpm run dev`，推送 GitHub 后部署到 Cloudflare。
- 后端：`meituanGo/`（Go + Gin），通过 SFTP 部署到 VPS，对外 API base 为 `https://api.serbia70.com/`。

本设计的范围 **仅覆盖前端止血（meituanAstro）**，并明确边界以避免误删/误改仓库结构。

## 目标（P0）
1. **敏感信息止血**：前端仓库与前端部署（Cloudflare）中不再包含任何可用的高权限凭据（master token / MQTT 账号密码）。
2. **降低 DOM XSS 风险（止血范围）**：前端业务代码中指定危险 DOM sink API 归零（`innerHTML`/`insertAdjacentHTML`/`outerHTML`/`document.write`/`dangerouslySetInnerHTML`）。本轮不承诺覆盖所有潜在 XSS 向量（例如 URL/属性注入、第三方渲染链路等），仅对上述 sink 做“归零止血”。
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

## 现状与差距（实现前）
- `meituanAstro/wrangler.toml` 目前包含 `PUBLIC_MASTER_TOKEN` / `PUBLIC_MQTT_USERNAME` / `PUBLIC_MQTT_PASSWORD` 三个键，且应保持空字符串（由 `scripts/security-secrets.test.mjs` 约束）。
- `scripts/check-no-unsafe-dom-apis.test.mjs` 目前仅检查 `src/scripts/admin/user-chat.ts` 是否包含 `.innerHTML` 与 `insertAdjacentHTML`，覆盖面不足以证明“全 src 归零”。
- `src/components/UserModal.tsx` 目前存在 `dangerouslySetInnerHTML` 用法，需要在实现中移除。
- `src/config.ts` 仍读取 `PUBLIC_MASTER_TOKEN` / `PUBLIC_MQTT_*`，与“敏感项移出前端”目标存在冲突，需要在实现中改造/降级。

## 方案（采用）
采用“止血 + 最小行为变更”方案：

1) **凭据治理止血**：
- **仓库侧**：不在版本库中提交任何可用凭据值；对历史/日志进行清理并完善忽略规则。
  - 允许在 `wrangler.toml` 中保留 `PUBLIC_MASTER_TOKEN` / `PUBLIC_MQTT_USERNAME` / `PUBLIC_MQTT_PASSWORD` 三个键作为“空值哨兵”（必须始终为 `""`），用于自动化检测“未提交真实凭据”。
  - 但这三个键**不得在 Cloudflare Pages 的环境变量中被赋真实值**，且不得在前端运行时作为能力依赖。
- **Cloudflare Pages/Workers 侧**：确保不存在任何可用的 master/MQTT 凭据（不以 `PUBLIC_` 形式提供；如曾配置过视为已泄露，需轮换）。

2) **危险 DOM sink API 归零**：
- 在 **`meituanAstro/` 范围内** 扫描并替换为安全 DOM 渲染（`createElement`/`textContent`/`replaceChildren`）。

3) **防回归（明确可执行）**：
- 将现有检查脚本纳入常规验证，并在本轮实现中补齐覆盖面：
  - `meituanAstro/scripts/security-secrets.test.mjs`：继续作为“wrangler.toml 空值哨兵”检测。
  - `meituanAstro/scripts/check-no-unsafe-dom-apis.test.mjs`：本轮将其从“单文件检查”扩展为**递归扫描 `meituanAstro/src/**`（至少覆盖 `src/components`、`src/scripts`、`src/pages`、`src/lib`）**，对以下 sink 字符串做阻断：
    - `innerHTML`
    - `insertAdjacentHTML`
    - `outerHTML`
    - `document.write`
    - `dangerouslySetInnerHTML`

> 说明：当前仓库版本的 `check-no-unsafe-dom-apis.test.mjs` 覆盖面不足；扩展后的脚本是本轮实现的一部分，验收以扩展后脚本运行结果为准。

- 本地至少确保可以用 node 直接运行这些脚本（CI 是否启用可选，但本轮必须保证本地验收可复现）。

4) **功能影响边界（与“敏感项移出前端”对齐）**：
- 用户侧聊天/实时能力当前存在浏览器直连 MQTT 的实现迹象（例如 `src/components/UserChat.astro` 与 `src/lib/user-chat-realtime.ts` 读取 `PUBLIC_MQTT_*`）。由于本轮要求“敏感项全部移出前端”，本轮允许临时降级为“无实时推送/不建立带凭据的 MQTT 连接”（或改为轮询/SSE 由后端提供——若需要后端配合，另起 spec）。
- 本轮的“仅前端止血”不承诺重建实时链路，只承诺把敏感口令从前端彻底移除。

## 验收标准（可复现）
### A. 秘密/凭据不在前端
- **仓库侧**：
  - `meituanAstro/wrangler.toml` 中 `PUBLIC_MASTER_TOKEN` / `PUBLIC_MQTT_USERNAME` / `PUBLIC_MQTT_PASSWORD` 三个键**必须存在且值必须为 `""`**（作为“空值哨兵”，用于检测仓库未提交真实凭据）。
- Cloudflare Pages 项目环境变量中：不得为上述 `PUBLIC_*` 配置任何真实值（最好直接不配置这三项；如必须存在也只能为空）。
  - 仓库中不存在 `wrangler-dev.log`、`dev-server*.log` 等可能记录环境变量的日志文件。
- **构建产物侧**：对 `meituanAstro/dist/` 扫描，不应出现上述敏感 key（以及常见的 MQTT 凭据 key）。本轮以“关键字扫描”作为止血验收（避免要求精确值匹配导致误报/漏报）。

### B. 危险 DOM sink API 为 0（业务代码）
- 扫描 `meituanAstro/src/`（递归） 与 `meituanAstro/scripts/`：
  - 禁止：`innerHTML`、`insertAdjacentHTML`、`outerHTML`、`document.write`、`dangerouslySetInnerHTML`
  - 允许：检查脚本/测试中出现这些字符串用于断言（必须明确标注为“检查用途”）。

### C. 可执行验收命令
- 在 `meituanAstro/` 下：
  - `pnpm run dev`（核心路径可用：至少覆盖 `/admin/02`）
  - `pnpm run build`
  - `node scripts/security-secrets.test.mjs`
  - `node scripts/check-no-unsafe-dom-apis.test.mjs`（以本轮扩展后的递归扫描为准）
  - `node -e "const {execSync}=require('node:child_process');const out=execSync(process.platform==='win32'?'where pnpm':'which pnpm',{encoding:'utf8'});process.stdout.write(out)"`（确认 pnpm 可用，避免环境差异）
  - `node -e "const {execSync}=require('node:child_process');const out=execSync('git diff --name-only HEAD~1..HEAD',{encoding:'utf8'});console.log(out)"`（提交后检查变更文件列表，确保符合边界）
  - `node -e "const {execSync}=require('node:child_process');const out=execSync('git grep -n \\\"PUBLIC_MASTER_TOKEN\\\" -- dist || true',{encoding:'utf8'});console.log(out)"`（对 dist 做关键字扫描；实现时可扩展到更多关键词）

### D. 变更集边界
- 本轮提交的变更应限制在：`meituanAstro/**` 与必要的忽略/日志治理文件；不得包含仓库根目录的大规模删除（避免误操作导致结构损坏）。

## 回滚策略
- **代码回滚**：以页面/模块为单位提交；若出现行为偏差，可回滚到替换前的单个 commit。
- **配置回滚**：Cloudflare Pages 项目环境变量/Secrets 的变更应记录为清单；如需回滚，按清单恢复。
  - 注意：凭据轮换通常不可逆，只能通过“再次轮换/重设”恢复服务。
- **不可逆项提醒**：一旦执行线上凭据轮换，旧凭据不应继续使用；回滚只能通过重新设置新凭据完成。
