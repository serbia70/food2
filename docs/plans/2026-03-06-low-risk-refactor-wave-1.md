# Low Risk Refactor Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改变核心业务行为的前提下，完成首批低风险收口重构，统一前端事件协议与桌号工具，并抽出后端 shop helper 以减少重复代码。

**Architecture:** 这次只做小范围公共层抽取，不大拆核心业务文件。前端新增轻量共享模块承载事件常量和桌号规则，后端新增 shop helper 承载按 slug 查 shop 和 settings 读写能力，再把少量高重复调用替换为 helper。

**Tech Stack:** Astro, Preact, TypeScript, Go, Gin, sqlx

---

### Task 1: 统一前端购物车打开事件

**Files:**
- Create: `meituanAstro/src/lib/events.ts`
- Modify: `meituanAstro/src/components/UserModal.tsx`
- Modify: `meituanAstro/src/components/CartModal.tsx`

**Step 1: 写最小失败验证（手工）**

```text
现状验证：
1. 在页面触发 UserModal 的“去结算 / Plati >”按钮
2. 预期当前问题是 UserModal 派发 open-cart-modal，而 CartModal 监听 open-cart
3. 如果现网表现为点击后未正常打开购物车，说明验证成立
```

**Step 2: 新增事件常量模块**

```ts
export const SHOP_EVENTS = {
  OPEN_CART: 'open-cart',
  OPEN_USER_MODAL: 'open-user-modal',
  OPEN_RESERVATION: 'open-reservation',
} as const;
```

**Step 3: UserModal 改为使用统一事件名**

```ts
window.dispatchEvent(new CustomEvent(SHOP_EVENTS.OPEN_CART));
```

**Step 4: CartModal 改为使用统一事件名监听**

```ts
window.addEventListener(SHOP_EVENTS.OPEN_CART, handleOpenCart);
return () => window.removeEventListener(SHOP_EVENTS.OPEN_CART, handleOpenCart);
```

**Step 5: 手工验证**

```text
1. 打开前台页面
2. 从 UserModal 点击去结算
3. 预期：CartModal 正常打开，且无控制台事件名不匹配报错
```

---

### Task 2: 抽前端桌号共享工具

**Files:**
- Create: `meituanAstro/src/lib/table-config.ts`
- Modify: `meituanAstro/src/components/CartModal.tsx`
- Modify: `meituanAstro/src/pages/[slug]/index.astro`
- Modify: `meituanAstro/src/pages/admin/[slug]/index.astro`

**Step 1: 写最小失败验证（手工）**

```text
记录现状：
1. 前台桌号按钮显示规则
2. 前台提交 table 参数的值
3. 后台桌台卡片识别同一桌号的规则
如果未来出现前台显示/提交与后台识别不一致，本任务就是为了收口这类风险
```

**Step 2: 新增共享 table-config 工具**

至少包含以下函数：

```ts
export function isHallLikeZoneName(v: unknown): boolean
export function isPlaceholderZoneName(v: unknown): boolean
export function resolveZonePrefix(zone, simpleHallMode): string
export function buildTableValue(zone, idx, simpleHallMode): string
export function buildTableButtonLabel(zone, idx, simpleHallMode): string
export function isSimpleHallMode(tableConfig): boolean
```

**Step 3: CartModal 改用共享函数**

删除文件内重复的：
- `isHallLikeZoneName`
- `isPlaceholderZoneName`
- `resolveZonePrefix`
- `buildTableValue`
- `buildTableButtonLabel`

**Step 4: 页面入口逐步改用共享函数**

只替换纯规则函数，不改页面数据流：
- `meituanAstro/src/pages/[slug]/index.astro`
- `meituanAstro/src/pages/admin/[slug]/index.astro`

**Step 5: 手工验证**

```text
1. 前台进入桌号选择场景
2. 确认按钮显示与原先一致
3. 进入后台桌台页，确认相同桌号仍能匹配订单
```

---

### Task 3: 抽后端 shop helper

**Files:**
- Create: `meituanGo/internal/handlers/shop_helpers.go`
- Modify: `meituanGo/internal/handlers/order.go`
- Modify: `meituanGo/internal/handlers/reservation.go`
- Modify: `meituanGo/internal/handlers/menu.go`
- Modify: `meituanGo/internal/handlers/mobile.go`
- Modify: `meituanGo/internal/handlers/realtime.go`

**Step 1: 写最小失败验证（静态）**

```text
现状：多个 handler 重复写
SELECT id FROM shops WHERE slug = ?
目标：抽成统一 helper，行为不变
```

**Step 2: 新增 helper**

```go
func getShopIDBySlug(slug string) (int64, error)
```

内部只做一件事：

```go
var shopID int64
err := db.DB.Get(&shopID, "SELECT id FROM shops WHERE slug = ? LIMIT 1", slug)
return shopID, err
```

**Step 3: 替换重复调用**

将上述 5 个文件中的直接查询改为 helper 调用，保持原有错误返回不变。

**Step 4: 手工验证**

```text
核对各文件返回逻辑未变化：
- 找不到店铺仍返回 404 或原先错误
- 只减少重复，不调整语义
```

---

### Task 4: 抽第一版 shop settings helper

**Files:**
- Update: `meituanGo/internal/handlers/shop_helpers.go`
- Modify: `meituanGo/internal/handlers/master.go`
- Modify: `meituanGo/internal/handlers/admin_settings_actions.go`

**Step 1: 写最小失败验证（静态）**

```text
现状：settings 读写在多个 handler 中直接 SQL Exec / Get
目标：先抽 helper，不一次性改完所有 settings 代码
```

**Step 2: 新增 helper**

```go
func getShopSettingsRaw(shopID int64) (string, error)
func updateShopSettingsRaw(shopID int64, settings string) error
```

**Step 3: 只替换最直接的重复调用**

优先替换 `master.go` 和 `admin_settings_actions.go` 中最直白的：

```go
UPDATE shops SET settings = ? WHERE id = ?
```

**Step 4: 手工验证**

```text
核对替换后仍然只是同样的 SQL，只是收口到 helper
不改变 settings merge 行为
```

---

### Task 5: 可用验证与结果记录

**Files:**
- Modify: `docs/plans/2026-03-06-low-risk-refactor-wave-1.md`

**Step 1: 运行可用验证**

若本地工具链可用，优先：

```bash
pnpm run build
go test ./...
```

若当前环境无法运行，则明确记录未验证原因与建议人工验证步骤。

**Step 2: 记录结果**

在文档末尾补充：
- 已完成范围
- 未完成范围
- 验证方式
- 后续建议（下一步开始拆 CartModal / order.go）
