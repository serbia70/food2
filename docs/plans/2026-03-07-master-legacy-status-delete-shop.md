# Master Legacy Status And Delete Shop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为旧店铺统一主控展示状态口径，并在 Astro 版 `/master` 中补上删除店铺功能，让主控台对旧数据更稳定、对店铺管理更完整。

**Architecture:** 在后端 `/api/master/init` 中新增面向主控台的统一显示字段（如 `display_status`、`display_billing_status`、`display_expiry_status`），把旧店铺历史脏数据转换成统一口径；前端表格改为优先消费这些显示字段。删除店铺则沿用后端现有 `delete_shop` action，在前端加入二次确认和成功后刷新。

**Tech Stack:** Go, Gin, SQLite, Astro, TypeScript

---

### Task 1: 为旧店铺统一显示口径补后端失败测试

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_status_test.go`
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Write the failing test**

增加测试，覆盖旧店铺这些场景：
- 有余额但历史 `billing_status = inactive`
- `status` 缺失或脏值
- `expire_date` 为空

期望后端返回新的显示字段，例如：
- `display_status`
- `display_billing_status`
- `display_expiry_status`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: FAIL，因为这些 display 字段还不存在。

**Step 3: Write minimal implementation**

在 `master_init_data.go` 中新增统一状态推导：
- `display_status`
- `display_billing_status`
- `display_expiry_status`
- 必要时 `display_row_tone`

目标：
- 老店铺有余额时不要继续直接落成“预警/欠费”矛盾状态
- `status` 为空时给合理默认值

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

---

### Task 2: 在前端改用 display 字段而不是原始字段直出

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加测试，确保：
- 若后端提供 `display_status`，前端优先显示它
- 若后端提供 `display_billing_status`，前端不再自己把 `inactive` 硬映射
- 若后端提供 `display_expiry_status`，前端优先使用它

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果当前仍只看原始字段。

**Step 3: Write minimal implementation**

更新 `master-shop-view.ts`：
- 优先读取 `display_*`
- 没有时再回退旧字段逻辑

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 3: 在店铺表格中补“删除店铺”动作

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add delete button**

在每行操作区增加：
- `删除`

**Step 2: Add confirmation**

删除前必须二次确认，例如：
- `确认删除店铺 XXX 吗？此操作不可恢复。`

**Step 3: Submit using explicit route**

前端调用：`DELETE /api/master/shops/123`

**Step 4: Refresh after success**

删除成功后：
- 给明确提示
- 刷新当前 `/master` 页面

---

### Task 4: 补删除店铺的最小后端验证

**Files:**
- Create: `meituanGo/internal/handlers/master_delete_shop_test.go`

**Step 1: Write the failing test**

写最小测试验证：
- `DELETE /api/master/shops/:id` 可删除存在的店铺
- 删除后 `shops` 表中记录消失

**Step 2: Run test to verify it fails or reveals mismatch**

Run: `go test ./internal/handlers -run TestMasterManageDeleteShop -count=1`
Expected: 若当前行为与前端 payload 不完全一致，应先失败暴露问题。

**Step 3: Write minimal implementation if needed**

如果 `DELETE /api/master/shops/:id` 已可用，则无需改实现；若鉴权/参数映射/关联删除有问题，再做最小修正。

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterManageDeleteShop -count=1`
Expected: PASS

---

### Task 5: 验证旧店铺与新店铺主控显示

**Files:**
- Modify: `docs/plans/2026-03-07-master-legacy-status-delete-shop.md`

**Step 1: Run backend tests**

Run: `go test ./internal/handlers -run "TestMasterInitDataIncludesResolvedShopStatus|TestMasterManageDeleteShop" -count=1`
Expected: PASS

**Step 2: Run frontend tests**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

验证：
- 老店铺状态不再大面积“未知/预警乱飞”
- 新店铺状态仍然正常
- 删除店铺按钮可用

---

### Task 6: 记录下一波功能

**Files:**
- Modify: `docs/plans/2026-03-07-master-legacy-status-delete-shop.md`

**Step 1: Record next priorities**

记录下一波：
- 删除订单
- 到期/宽限逻辑更完整统一
- 编辑店铺保存后的局部反馈优化
