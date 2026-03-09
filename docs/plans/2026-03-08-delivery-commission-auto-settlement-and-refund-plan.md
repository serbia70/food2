# Delivery Commission Auto Settlement And Refund Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立“外卖订单按 05:00 营业日自动完成并扣提成，误结算提成可由商家申请、master 审批后全额退回”的完整闭环。

**Architecture:** 以后端规则为核心，先统一营业日与自动完成逻辑，再把提成生成时点收口到 `completed`，最后补商家申请与 master 审批前端。账务返还通过 `billing_accounts + billing_ledger + commission_records` 三层同步，避免只改余额导致审计断裂。

**Tech Stack:** Go, Gin, SQLite/SQLX, Astro, TypeScript

---

### Task 1: 固化 05:00 营业日规则

**Files:**
- Create: `meituanGo/internal/handlers/commission_business_day.go`
- Test: `meituanGo/internal/handlers/commission_business_day_test.go`

**Step 1: Write the failing test**

覆盖这些 case：
- 即时单 `2026-03-10 02:30` 属于前一个营业日
- 即时单 `2026-03-10 12:00` 属于当天营业日
- 预订单 `scheduled_at=2026-03-11 01:30` 属于 `2026-03-10` 营业日
- 自动完成时间始终是对应营业日结束后的 `05:00`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestCommissionBusinessDay`
Expected: FAIL

**Step 3: Write minimal implementation**

新增 helper：
- `resolveBusinessDay(time.Time) string`
- `resolveDeliveryFulfillmentDay(createdAt, scheduledAt *time.Time) string`
- `resolveAutoCompleteAt(createdAt, scheduledAt *time.Time) time.Time`

规则：
- `00:00-04:59` 归前一个营业日
- 预订单优先使用预约履约时间
- 自动完成时点 = 履约营业日结束后的 `05:00`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestCommissionBusinessDay`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/handlers/commission_business_day.go meituanGo/internal/handlers/commission_business_day_test.go
git commit -m "feat: add 5am business day commission helpers"
```

### Task 2: 建立提成退款申请数据结构

**Files:**
- Modify: `meituanGo/internal/db/migrations.go`
- Test: `meituanGo/internal/db/migrations_test.go`

**Step 1: Write the failing test**

增加断言：
- 存在表 `commission_refund_requests`
- 表字段包含：
  - `shop_id`
  - `order_id`
  - `commission_record_id`
  - `commission_amount`
  - `reason`
  - `status`
  - `review_note`
  - `reviewed_by`
  - `reviewed_at`
  - `created_at`
  - `updated_at`
- `commission_records` 增加 `refund_status`
- 至少有一个用于防止重复待审批的索引/约束

**Step 2: Run test to verify it fails**

Run: `go test ./internal/db -run TestMigrations`
Expected: FAIL

**Step 3: Write minimal implementation**

Migration 增加：
- 新表 `commission_refund_requests`
- `commission_records.refund_status TEXT DEFAULT 'none'`
- 必要索引：
  - `idx_commission_refund_shop_status`
  - `idx_commission_refund_commission_record`
- 如数据库能力允许，增加“同一提成同一时间最多一条 pending”的约束策略；如果 SQLite 条件索引不方便，就在 handler 层保证

**Step 4: Run test to verify it passes**

Run: `go test ./internal/db -run TestMigrations`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/db/migrations.go meituanGo/internal/db/migrations_test.go
git commit -m "feat: add commission refund request schema"
```

### Task 3: 把提成生成时点收口到 completed

**Files:**
- Modify: `meituanGo/internal/handlers/billing.go`
- Modify: `meituanGo/internal/handlers/promotions.go`
- Test: `meituanGo/internal/handlers/billing_test.go`

**Step 1: Write the failing test**

覆盖：
- 订单进入 `confirmed` 时不生成提成记录
- 订单进入 `completed` 时生成提成记录
- 同一订单重复进入 `completed` 不重复扣提成
- `cancelled/rejected/refunded` 不生成提成

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestDeliveryCommission`
Expected: FAIL

**Step 3: Write minimal implementation**

梳理当前生成 `commission_records` 和 `billing_ledger.delivery_commission` 的入口：
- 如果当前在确认时扣，改为仅在完成时触发
- 加幂等保护：
  - 订单级唯一判断
  - 或查 `commission_records` 是否已存在对应订单记录
- 设置 `refund_status='none'`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestDeliveryCommission`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/handlers/billing.go meituanGo/internal/handlers/promotions.go meituanGo/internal/handlers/billing_test.go
git commit -m "fix: charge delivery commission only on completion"
```

### Task 4: 增加 05:00 自动完成外卖单批处理

**Files:**
- Modify: `meituanGo/cmd/server/main.go`
- Create: `meituanGo/internal/handlers/commission_auto_complete.go`
- Test: `meituanGo/internal/handlers/commission_auto_complete_test.go`

**Step 1: Write the failing test**

覆盖：
- 即时外卖单在对应营业日后的 `05:00` 自动完成
- 预订送在预约履约营业日后的 `05:00` 自动完成
- `cancelled/rejected/refunded/completed` 跳过
- 自动完成后触发提成扣费
- 写入 `completion_source = auto_5am`（如果决定加字段）

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestAutoCompleteDeliveryOrders`
Expected: FAIL

**Step 3: Write minimal implementation**

新增批处理函数：
- 按订单类型、状态、履约时间筛选
- 满足条件的订单更新为 `completed`
- 触发现有 completed 结算逻辑
- 记录自动完成来源
- 在 server 启动逻辑里接定时任务或周期检查入口

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestAutoCompleteDeliveryOrders`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/cmd/server/main.go meituanGo/internal/handlers/commission_auto_complete.go meituanGo/internal/handlers/commission_auto_complete_test.go
git commit -m "feat: auto complete delivery orders after 5am business cutoff"
```

### Task 5: 新增商家端提成退款申请接口

**Files:**
- Create: `meituanGo/internal/handlers/commission_refund.go`
- Modify: `meituanGo/cmd/server/main.go`
- Test: `meituanGo/internal/handlers/commission_refund_test.go`

**Step 1: Write the failing test**

覆盖：
- 可对“已完成且已计提成”的外卖订单发起申请
- 理由为空时报错
- 已有 `pending` 时不能重复申请
- 已 `approved` 的提成不能再次申请
- 驳回后允许再次申请新记录

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestCommissionRefundRequest`
Expected: FAIL

**Step 3: Write minimal implementation**

新增商家接口：
- `POST /api/admin/commission-refund/request`
- `GET /api/admin/commission-refund/list`

校验：
- 外卖单
- 已完成
- 存在提成记录
- `refund_status != refunded`
- 当前无 pending

插入 `commission_refund_requests`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestCommissionRefundRequest`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/handlers/commission_refund.go meituanGo/internal/handlers/commission_refund_test.go meituanGo/cmd/server/main.go
git commit -m "feat: add merchant commission refund requests"
```

### Task 6: 新增 master 审批接口与退款账务返还

**Files:**
- Modify: `meituanGo/internal/handlers/billing.go`
- Modify: `meituanGo/internal/handlers/commission_refund.go`
- Test: `meituanGo/internal/handlers/commission_refund_test.go`

**Step 1: Write the failing test**

覆盖：
- master 审批通过后：
  - `billing_accounts.balance_rsd` 增加
  - 新增 `billing_ledger.entry_type = commission_refund`
  - `commission_records.refund_status = refunded`
  - 申请状态 = `approved`
- 审批驳回后：
  - 不改余额
  - 状态 = `rejected`
- 已通过记录不能再审批

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestCommissionRefundReview`
Expected: FAIL

**Step 3: Write minimal implementation**

新增 master 接口：
- `GET /api/master/commission-refund/requests`
- `POST /api/master/commission-refund/review`

通过时执行事务：
- 更新余额
- 写 ledger
- 更新 commission record
- 更新 refund request

驳回时：
- 只更新 request 状态与 `review_note`

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestCommissionRefundReview`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/handlers/billing.go meituanGo/internal/handlers/commission_refund.go meituanGo/internal/handlers/commission_refund_test.go
git commit -m "feat: add master approval for commission refunds"
```

### Task 7: 商家后台增加退款申请 UI

**Files:**
- Modify: `meituanAstro/src/pages/admin/[slug]/index.astro`
- Create: `meituanAstro/src/components/admin/AdminCommissionRefundModal.astro`
- Create: `meituanAstro/src/scripts/admin/commission-refund.ts`

**Step 1: Write the failing test**

如果当前没有前端测试框架，先写最小设计级回归检查清单：
- 已完成外卖单显示 `申请退提成`
- pending 显示 `退款审批中`
- approved 显示 `已退款`
- rejected 显示 `退款被驳回`
- 提交空理由时报错

**Step 2: Run test to verify it fails**

Run: `pnpm build`
Expected: 当前无此 UI 或逻辑未接入

**Step 3: Write minimal implementation**

前端增加：
- 退款申请按钮
- 退款申请弹窗
- 订单号/金额/提成金额只读展示
- 理由输入
- 状态文案展示

脚本调用新 admin API

**Step 4: Run test to verify it passes**

Run: `pnpm build`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanAstro/src/pages/admin/[slug]/index.astro meituanAstro/src/components/admin/AdminCommissionRefundModal.astro meituanAstro/src/scripts/admin/commission-refund.ts
git commit -m "feat: add merchant commission refund request UI"
```

### Task 8: master 后台增加审批 UI

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Create: `meituanAstro/src/components/master/MasterCommissionRefundPanel.astro`
- Create: `meituanAstro/src/lib/master-commission-refund-view.ts`

**Step 1: Write the failing test**

最小检查清单：
- master 页面可看到待审批列表
- 能查看店铺、订单、提成、理由
- 能通过或驳回
- 驳回需填写原因（推荐）

**Step 2: Run test to verify it fails**

Run: `pnpm build`
Expected: 当前无审批面板

**Step 3: Write minimal implementation**

新增 master 退款审批面板：
- 待审批列表
- 已通过/已驳回列表（可后续追加）
- 通过/驳回按钮
- 调用审批 API
- 成功后刷新当前列表

**Step 4: Run test to verify it passes**

Run: `pnpm build`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanAstro/src/pages/master/index.astro meituanAstro/src/components/master/MasterCommissionRefundPanel.astro meituanAstro/src/lib/master-commission-refund-view.ts
git commit -m "feat: add master commission refund approval panel"
```

### Task 9: 回归与规则验证

**Files:**
- Create: `docs/plans/2026-03-08-commission-rules-and-refund-design.md`
- Test: `meituanGo/internal/handlers/*_test.go`
- Test: `meituanGo/internal/db/migrations_test.go`

**Step 1: Write the failing test**

补齐遗漏 case：
- 05:00 营业日边界
- 预约单不提前自动完成
- 完成时才扣提成
- 退款申请 pending 唯一
- 驳回后允许再次申请
- approved 后禁止再次申请

**Step 2: Run test to verify it fails**

Run:
- `go test ./internal/db ./internal/handlers`
- `pnpm build`

**Step 3: Write minimal implementation**

补齐边界处理和文档说明。

**Step 4: Run test to verify it passes**

Run:
- `go test ./internal/db ./internal/handlers`
- `pnpm build`

Expected: 全部通过

**Step 5: Commit**

```bash
git add docs/plans/2026-03-08-commission-rules-and-refund-design.md meituanGo/internal/db meituanGo/internal/handlers meituanAstro/src/pages meituanAstro/src/components meituanAstro/src/scripts meituanAstro/src/lib
git commit -m "feat: add delivery commission auto settlement and refund workflow"
```
