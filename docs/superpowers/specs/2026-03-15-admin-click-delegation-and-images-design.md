# 2026-03-15 Admin 点击委托统一 + 点餐图片修复（design）

## 背景与目标
线上反馈：移动端 admin 页面“点击按钮无效”，点餐页“图片不显示”。结合 iOS12 兼容性要求，确认前端存在：
- 多处 `onclick` 依赖全局函数，且脚本中断会导致函数未注册。
- `replaceChildren` 在 iOS12 下不支持导致脚本报错。
- 点餐页图片使用后端相对路径时未归一化，导致浏览器请求前端域名而 404。

目标：
1. **统一 admin 事件入口**，全部改为 `data-admin-action` 委托，消除 `onclick` 依赖。
2. **移除 iOS12 不兼容 DOM API**（`replaceChildren`）。
3. **修复菜单图片 URL**，相对路径补齐后端前缀。

## 范围
- 仅修改前端（Astro）代码。
- 不改后端。

## 方案（已确认）
### A. Admin 事件委托统一
- 将 `onclick="..."` 全部改为 `data-admin-action`（保持现有 action 命名风格）。
- 在 `src/scripts/admin/click-delegation.ts` 扩展 action 分支，调用现有模块函数。
- 保持业务函数实现不变，仅改变触发入口。

涉及文件：
- `src/components/admin/TabCustomers.astro`
- `src/components/admin/TabMarketing.astro`
- `src/components/admin/TabReservations.astro`
- `src/components/admin/AdminModals.astro`
- `src/scripts/admin/click-delegation.ts`

### B. iOS12 DOM API 兼容
- 将 `replaceChildren` 替换为兼容写法（清空后再 append），避免 iOS12 抛错。

涉及文件：
- `src/components/admin/TabCustomers.astro`
- `src/components/admin/TabMarketing.astro`

### C. 点餐图片 URL 归一化
- 在 `src/pages/[slug]/index.astro` 处理 `p.img`：
  - 相对路径（`/uploads/...`）补 `API_BASE_URL` 前缀。
  - 空值维持 fallback。

涉及文件：
- `src/pages/[slug]/index.astro`

## 验收标准
1. iOS12 设备访问 `/admin/<slug>`：客户/营销/预约按钮可点击并触发动作。
2. `/[slug]` 菜单图片正常显示（非文本模式）。
3. 前端构建通过，未引入新增后端改动。

## 风险与回滚
- 风险：事件委托映射遗漏导致个别按钮失效。
- 回滚：逐文件回滚到 `onclick` 版本，或回滚整个 commit。
