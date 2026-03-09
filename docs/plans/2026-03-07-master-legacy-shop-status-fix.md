# Master Legacy Shop Status Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正 Astro 版 `/master` 中老店铺的状态、账单状态、到期状态显示，让有余额的老店铺不再错误显示为 `inactive` 或 `未知`，并使到期判断更符合业务含义。

**Architecture:** 先从后端 `/api/master/init` 入手，补齐 `shops.status` 等原始字段，并规范旧账单状态与余额/宽限期的组合判定；再在前端 `master-shop-view.ts` 中用更合理的映射策略生成最终展示标签。这样先修数据口径，再修展示，避免继续在前端堆兼容补丁。

**Tech Stack:** Go, Gin, SQLite, Astro, TypeScript

---

### Task 1: 为主控店铺状态口径写后端失败测试

**Files:**
- Create: `meituanGo/internal/handlers/master_init_status_test.go`
- Modify: `meituanGo/internal/handlers/master_init_data.go`

**Step 1: Write the failing test**

写最小测试覆盖：
- 当店铺 `status='active'` 时，`/api/master/init` 返回里也应包含 `status: active`
- 当 `billing_status='inactive'` 但余额充足时，应返回一个更合理的主控展示状态字段或 alert 字段，至少不能只剩无解释的 `inactive`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: FAIL，因为当前 SQL 没查 `shops.status`，旧账单状态解释也不完整。

**Step 3: Write minimal implementation**

在 `master_init_data.go`：
- 把 `shops.status` 正式查出来
- 增加旧账单状态规范化逻辑，例如：
  - `inactive + balance > 0` 时返回更合理的可展示状态
  - 保留原始账单状态字段供前端判断

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

---

### Task 2: 修正到期状态与账单状态组合口径

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`
- Test: `meituanGo/internal/handlers/master_init_status_test.go`

**Step 1: Add failing cases**

增加测试场景：
- 有 `expire_date` 且已过期
- 无 `expire_date` 但账单余额正常
- 宽限期内与余额充足的老店铺

**Step 2: Implement normalization**

输出供前端使用的更稳定字段，例如：
- `status`
- `billing_status`
- `billing_alert`
- 必要时新增 `billing_display_status`

目标：
- 老店铺不会因为历史脏数据简单落成 `inactive`
- 到期状态与余额状态不再互相矛盾

---

### Task 3: 前端视图模型改为使用规范化字段

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加前端测试覆盖：
- `status='active'` 应显示 `营业中`
- `billing_status='inactive'` 但余额充足时，不应直接显示英文 `inactive`
- 过期店铺应优先显示 `已过期`

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果当前仍直接把未知状态或英文状态透出。

**Step 3: Write minimal implementation**

在 `master-shop-view.ts` 中：
- 优先消费后端规范化字段
- 对旧字段做兼容映射
- 不再把 `inactive` 直接展示给用户

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 4: 校正表格标签文案与色彩

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Update billing/status badges**

根据新视图模型调整：
- 营业状态标签
- 账单状态标签
- 到期标签

要求：
- 不出现面向运营人员的英文裸值（如 `inactive`）
- 标签色彩和含义一致

**Step 2: Keep old-row readability**

重点验证你提到的老店铺案例：
- 有余额
- 旧账单状态脏数据
- 到期字段缺失或旧格式

---

### Task 5: 评估删除订单入口是否排入下一波

**Files:**
- Modify: `docs/plans/2026-03-07-master-legacy-shop-status-fix.md`

**Step 1: Record delete-order as next priority**

本轮先不把删除订单混入状态修复；只在文档里记录为下一波功能项，避免范围失控。

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-legacy-shop-status-fix.md`

**Step 1: Run backend tests**

Run: `go test ./internal/handlers -run TestMasterInitDataIncludesResolvedShopStatus -count=1`
Expected: PASS

**Step 2: Run frontend tests**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

重点验证：
- 老店铺余额充足时不再显示生硬 `inactive`
- `status` 不再大量显示 `未知`
- 过期店铺状态与账单状态不再互相冲突
