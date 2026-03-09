# Master Shop State Single Source Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `/master` 中的门店状态只由后端统一产出一套主状态和异常原因，前端不再混合多套状态逻辑，从根本上消除“有余额却锁定/正常/预警互相打架”的问题。

**Architecture:** 后端 `/api/master/init` 统一产出：
- `display_shop_state`
- `display_shop_state_reason`
- `display_billing_status`

前端表格只消费这三类显示字段。其中 `display_shop_state` 是唯一主状态，`display_shop_state_reason` 只在异常状态时显示，账单列只保留余额和账单状态，不再重复锁定原因。

**Tech Stack:** Go, Gin, SQLite, Astro, TypeScript

---

### Task 1: 为统一主状态 + 异常原因写后端失败测试

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_status_test.go`
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Write the failing test**

增加测试覆盖：
- 正常运营店铺 -> `display_shop_state = 正常运营`, `display_shop_state_reason = ""`
- 外卖锁定 -> `display_shop_state = 外卖已锁定`, reason 不为空
- 堂食点餐停止 -> `display_shop_state = 堂食点餐停止`, reason 不为空
- 外卖堂食均停止 -> `display_shop_state = 外卖堂食均停止`, reason 不为空

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run "TestMasterInitDataIncludesResolvedShopStatus|TestMasterInitDataOperationalShopStates" -count=1`
Expected: FAIL，如果 `display_shop_state_reason` 还没统一输出。

**Step 3: Write minimal implementation**

在 `master_init_data.go` 中统一生成：
- 唯一主状态
- 异常时的原因文案

要求：
- 主状态只保留一层语义
- 原因单独输出，不混在别的列里

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run "TestMasterInitDataIncludesResolvedShopStatus|TestMasterInitDataOperationalShopStates" -count=1`
Expected: PASS

---

### Task 2: 清理前端门店状态列的重复信息

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Write the failing test**

前端测试应覆盖：
- `display_shop_state` 作为唯一主状态
- `display_shop_state_reason` 只在异常状态时展示
- 正常运营时不显示多余小字

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果前端还会额外显示冗余状态。

**Step 3: Write minimal implementation**

前端 view model 增加：
- `shopStateReason`

表格中：
- 正常运营 -> 只显示主状态
- 异常状态 -> 主状态 + 小字原因

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 3: 账单 / 余额列只保留账单语义

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Remove duplicate lock wording**

从 `账单 / 余额` 列移除重复的：
- `外卖已锁定`
- 其他锁定原因小字

这些只保留在门店状态列。

**Step 2: Keep balance and billing badge**

账单列只展示：
- 余额数值
- 账单状态标签

---

### Task 4: 筛选与展示继续一致

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Keep filter tied to display_shop_state**

筛选继续使用统一主状态值，不再引入新一套判断。

---

### Task 5: 验证删除店铺与其他动作不受影响

**Files:**
- Modify: `docs/plans/2026-03-07-master-shop-state-single-source.md`

**Step 1: Manual verification target**

确认：
- 详情
- 编辑
- 充值
- 后台
- 打开前台
- 删除

在状态列改造后仍然可用。

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-shop-state-single-source.md`

**Step 1: Run backend tests**

Run: `go test ./internal/handlers -run "TestMasterInitDataIncludesResolvedShopStatus|TestMasterInitDataOperationalShopStates" -count=1`
Expected: PASS

**Step 2: Run frontend tests**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

验证：
- 有余额但被锁的店铺，状态列有唯一主状态和清晰原因
- 正常运营店铺不再出现多余文案
- 账单列不再重复锁定原因
