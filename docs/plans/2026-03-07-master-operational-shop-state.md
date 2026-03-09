# Master Operational Shop State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `/master` 的门店状态改成真正反映经营限制的主状态列，只显示“正常运营 / 外卖已锁定 / 堂食点餐停止 / 外卖堂食均停止 / 已停用”这类业务状态。

**Architecture:** 不再让门店状态受历史到期字段主导，而由后端 `/api/master/init` 根据店铺启用状态、外卖锁定状态、堂食锁定状态综合推导 `display_shop_state`。前端表格继续只消费这个统一状态字段，账单 / 余额列保留余额和必要提醒，形成“状态负责能否经营，账单负责钱与提醒”的清晰分工。

**Tech Stack:** Go, Gin, SQLite, Astro, TypeScript

---

### Task 1: 为经营限制型门店状态写后端失败测试

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_status_test.go`
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Write the failing test**

增加测试场景，至少覆盖：
- 正常启用且外卖/堂食都可用 -> `正常运营`
- 仅外卖锁定 -> `外卖已锁定`
- 仅堂食锁定 -> `堂食点餐停止`
- 外卖和堂食都锁定 -> `外卖堂食均停止`
- 店铺停用 -> `已停用`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: FAIL，因为当前 `display_shop_state` 还只是一版简化逻辑。

**Step 3: Write minimal implementation**

在 `master_init_data.go` 新增或更新统一状态推导：
- 结合 `status`
- `enable_delivery`
- `enable_dine_in`
- `delivery_locked`
- 新增 `dine_in_locked`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

---

### Task 2: 后端补齐堂食锁定判断

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Implement dine-in lock derivation**

根据你新确认的业务规则：
- 余额不足时，堂食也可能停止

至少输出：
- `dine_in_locked`
- `dine_in_lock_reason`

**Step 2: Keep delivery logic intact**

不要破坏现有：
- `delivery_locked`
- `delivery_lock_reason`

---

### Task 3: 前端只展示统一门店状态

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Write the failing test**

增加前端测试，确保：
- `display_shop_state` 为 `堂食点餐停止` 时，前端直接展示该值
- `display_shop_state` 为 `外卖堂食均停止` 时，前端直接展示该值

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果前端还没有这些状态分支。

**Step 3: Write minimal implementation**

前端继续只读取统一的：
- `display_shop_state`

不要再在表格中重新推导经营限制逻辑。

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 4: 账单 / 余额列保留但不再替代主状态

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Keep billing column narrow in responsibility**

账单列只保留：
- 账单提醒标签
- 余额数值
- 必要的小字说明（如外卖已锁定）

不要再让它承担主经营状态判断。

**Step 2: Remove redundant wording where possible**

若主状态已明确写出：
- `外卖已锁定`
- `堂食点餐停止`

账单列不要再重复一模一样的大标签，最多保留辅助原因。

---

### Task 5: 删除店铺功能保持可用

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Verify delete action remains intact**

在门店状态列调整后，确认 `删除` 按钮仍然保留且行为不变。

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-operational-shop-state.md`

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
- 门店状态只显示一类主经营状态
- 不再出现“正常运营 + 已过期 + 正常”三重冲突
- 余额不足导致的堂食停止能够在主状态中体现
