# Master Unified Shop Status Column Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `/master` 表格中的“状态 + 到期”双列合并为单一“门店状态”列，消除旧店铺出现“营业中 / 已过期 / 正常”互相冲突的展示。

**Architecture:** 后端 `/api/master/init` 负责产出一个统一主状态字段，例如 `display_shop_state`，把旧店铺历史数据、余额状态、营业状态、外卖锁定状态整合成唯一主标签；前端表格删除“到期”列，改为展示单一“门店状态”列。账单 / 余额列继续保留，避免把账单信息混进主状态里。

**Tech Stack:** Go, Gin, SQLite, Astro, TypeScript

---

### Task 1: 为统一门店状态写后端失败测试

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_status_test.go`
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Write the failing test**

增加测试，期望 `/api/master/init` 返回：
- `display_shop_state`

至少覆盖：
- 营业中且余额正常 -> `正常运营`
- 外卖锁定 -> `外卖锁定`
- 已停用 -> `已停用`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: FAIL，因为 `display_shop_state` 还不存在。

**Step 3: Write minimal implementation**

在 `master_init_data.go` 新增统一状态推导函数，例如：
- `masterDisplayShopState(...)`

优先级建议：
- `disabled/expired` 等明确停用态优先
- `delivery_locked` 时显示 `外卖锁定`
- 其余默认 `正常运营`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

---

### Task 2: 前端视图模型切到统一门店状态字段

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加测试，确保前端优先使用：
- `display_shop_state`

并且不再需要单独依赖 `expiryLabel` 作为主展示。

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，因为前端还没有统一门店状态字段。

**Step 3: Write minimal implementation**

在 `master-shop-view.ts` 中新增：
- `shopStateLabel`

并优先读后端 `display_shop_state`。

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 3: 删除“到期”列并改为“门店状态”列

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Remove expiry column**

删除表头与单元格：
- `到期`

**Step 2: Rename status column**

把：
- `状态`

改成：
- `门店状态`

并显示统一的 `shopStateLabel`。

**Step 3: Keep billing separate**

`账单 / 余额` 列仍然保留，不要把余额状态和门店状态混成一列。

---

### Task 4: 清理不再需要的旧展示分支

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Reduce duplicated meaning**

既然“门店状态”已经统一，就不要再把：
- `已过期`
- `营业中`
- `正常`

在多个主列里重复表达。

**Step 2: Keep secondary hints only if needed**

如果确实需要保留到期信息，只能做次级小字，而不是主列。

---

### Task 5: 验证删除店铺功能不受影响

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Verify row actions remain intact**

在删除列调整后，确保这些动作仍可用：
- 详情
- 编辑
- 充值
- 后台
- 打开前台
- 删除

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-unified-shop-status-column.md`

**Step 1: Run backend test**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

**Step 2: Run frontend tests**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

验证：
- 表格中不再有“到期”列
- 老店铺不会再出现“营业中 / 已过期 / 正常”三重冲突
- 删除店铺按钮仍可用
