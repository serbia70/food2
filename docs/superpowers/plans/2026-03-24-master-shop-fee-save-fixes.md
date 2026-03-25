# Master 店铺提成保存修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 master 店铺编辑里“只有 01 店铺能改提成”和“新建店铺不继承全局预约/外卖启用状态”两个线上问题，并把店铺级预约提成改成真正可持久化。

**Architecture:** 保持现有单一 `commissionMode` 语义：`global` 表示店铺跟随全局默认，`override` 表示店铺覆盖生效。前端在提交店铺编辑时根据“当前表单值是否偏离全局默认”自动决定是否切到 `override`；后端继续以 `shops.settings` 作为覆盖配置存储层，并在 `MasterInitData` 中把有效的预约覆盖值投影回前端现有 view model。创建店铺时不再依赖数据库旧默认值，而是显式从 master settings 写入渠道启用初始值。

**Tech Stack:** Astro、TypeScript、node:test、Go、Gin、SQLite/sqlx、pnpm

---

## File Structure & Responsibilities

**Modify:**
- `src/lib/master-shop-edit-payload.ts`
  - 为店铺编辑 payload 增加“根据全局默认自动切换 commissionMode”的纯逻辑。
  - 保持现有兼容别名输出，不在页面里手写判断。
- `src/lib/master-shop-edit-payload.test.ts`
  - 锁定 `global -> override` 自动切换、未改费率时保持 `global`、恢复全局默认时仍保留 `global`。
- `src/pages/master/index.astro`
  - `handleShopEdit()` 提交时把 `masterFeeDefaults` 传给 serializer。
  - 保持“恢复全局默认”按钮只改费率字段，不直接写死额外业务逻辑。
- `src/pages/master/master-billing-ui.test.ts`
  - 锁定 master 页面源码仍通过共享 helper 提交店铺编辑，并把全局默认参与 payload 构造。
- `../foos2Go/internal/handlers/master_shop_admin.go`
  - `handleCreateShop()` 显式写入 `enable_delivery` / `enable_dine_in` / `enable_reservation`。
  - `handleUpdateShop()` 把预约覆盖值持久化到 `shops.settings`，并保留现有 delivery override 逻辑。
- `../foos2Go/internal/handlers/master_init_data.go`
  - 从 `shops.settings` 提取预约覆盖字段，在 `commission_mode=override` 时投影到 `MasterInitData` 回包。
- `../foos2Go/internal/handlers/master_create_shop_test.go`
  - 锁定新店会继承 master settings 的启用状态，而不是吃到数据库旧默认值 `enable_reservation=0`。
- `../foos2Go/internal/handlers/master_manage_actions_test.go`
  - 锁定：
    - 全局店铺手动改费率后会真正变成店铺覆盖
    - 预约覆盖值保存后会在 `MasterInitData` 刷新回包里读到
    - 切回 `global` 时 delivery 继续跟随全局默认

**Not touching unless tests prove it is required:**
- `src/lib/master-shop-view.ts`（现有解析器已经会消费 `reservation_commission_*` / `delivery` 默认值）
- `src/components/master/MasterShopEditPanel.astro`（本计划先修保存逻辑，不处理重复开关 UI）
- `../foos2Go/internal/handlers/reservation.go`（本计划不改预订下单 feature gate）
- `../foos2Go/internal/handlers/shop.go`（公开店铺页读取 `enable_reservation` 的逻辑已经正确）

---

## Task 1: 锁定前端“改了费率却仍保持 global”回归

**Files:**
- Modify: `src/lib/master-shop-edit-payload.ts`
- Modify: `src/lib/master-shop-edit-payload.test.ts`
- Modify: `src/pages/master/index.astro:1326-1368`
- Test: `src/pages/master/master-billing-ui.test.ts`

- [ ] **Step 1: 先写会失败的 payload 测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterShopEditPayload } from './master-shop-edit-payload.ts';

test('global 店铺修改外卖费率后应自动切到 override', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '2',
      name: 'Shop 02',
      slug: '02',
      commissionMode: 'global',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '6',
    },
    {
      defaults: {
        reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'override');
});

test('global 店铺未改费率时应继续保持 global', () => {
  const payload = buildMasterShopEditPayload(
    {
      id: '4',
      name: 'Shop 04',
      slug: '04',
      commissionMode: 'global',
      reservationEnabled: '1',
      reservationCommissionType: 'percentage',
      reservationCommissionValue: '3',
      deliveryEnabled: '1',
      deliveryCommissionType: 'percentage',
      deliveryCommissionValue: '5',
    },
    {
      defaults: {
        reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
        deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
      },
    },
  );

  assert.equal(payload.commissionMode, 'global');
});
```

同时给 `src/pages/master/master-billing-ui.test.ts` 增加源码断言，确认 `buildMasterShopEditPayload(` 的调用会带上 `masterFeeDefaults`（或者等价的 defaults 变量），防止页面重新回到“只传 formData 不传 defaults”。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run:
- `node --test src/lib/master-shop-edit-payload.test.ts`
- `node --test src/pages/master/master-billing-ui.test.ts`

Expected:
- `master-shop-edit-payload.test.ts` FAIL，因为当前 serializer 不会根据默认值自动把 `global` 切成 `override`
- 若源码断言已先补上，`master-billing-ui.test.ts` 也应先 FAIL

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `src/lib/master-shop-edit-payload.ts` 里：
- 给 `buildMasterShopEditPayload()` 增加第二个参数，例如：

```ts
buildMasterShopEditPayload(input, {
  defaults: {
    reservationPlan: { commissionType: 'percentage', commissionValue: 3 },
    deliveryPlan: { commissionType: 'percentage', commissionValue: 5 },
  },
})
```

- 新增一个纯比较逻辑：
  - 仅当传入 `commissionMode: 'global'`
  - 且当前 reservation 或 delivery 的 `commissionType` / `commissionValue` 与默认值不一致
  - 才把最终 payload 里的 `commissionMode` 强制改成 `override`
- 不要在这个步骤里处理重复开关 UI；只修保存语义

在 `src/pages/master/index.astro` 里：
- `handleShopEdit()` 调用 serializer 时把 `masterFeeDefaults` 传进去
- `resetMasterShopFeeDefaults()` 保持现状：按钮点击后把 `commissionMode` 设成 `global`

- [ ] **Step 4: 再跑测试，确认变绿**

Run:
- `node --test src/lib/master-shop-edit-payload.test.ts`
- `node --test src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/master-shop-edit-payload.ts src/lib/master-shop-edit-payload.test.ts src/pages/master/index.astro src/pages/master/master-billing-ui.test.ts
git commit -m "fix(master): switch edited shop fees to override"
```

---

## Task 2: 让新店显式继承全局渠道启用状态

**Files:**
- Modify: `../foos2Go/internal/handlers/master_shop_admin.go`
- Modify: `../foos2Go/internal/handlers/master_create_shop_test.go`

- [ ] **Step 1: 先写会失败的 Go 测试**

在 `../foos2Go/internal/handlers/master_create_shop_test.go` 里新增测试：

```go
func TestMasterCreateShopInheritsMasterChannelEnabledDefaults(t *testing.T) {
    setupMasterCreateShopTestDB(t)

    settings, _ := json.Marshal(map[string]interface{}{
        "reservation_enabled": 1,
        "delivery_enabled": 0,
    })
    if _, err := db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(settings)); err != nil {
        t.Fatalf("seed master settings failed: %v", err)
    }

    r := gin.New()
    r.POST("/api/master/shops", MasterCreateShop)

    body, _ := json.Marshal(map[string]interface{}{
        "name": "Shop 102",
        "slug": "102",
        "password": "pass",
    })
    req := httptest.NewRequest(http.MethodPost, "/api/master/shops", bytes.NewReader(body))
    req.Header.Set("Authorization", mustMasterAuthHeader(t))
    req.Header.Set("Content-Type", "application/json")

    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
    }

    var row struct {
        EnableDelivery    int64 `db:"enable_delivery"`
        EnableDineIn      int64 `db:"enable_dine_in"`
        EnableReservation int64 `db:"enable_reservation"`
    }
    if err := db.DB.Get(&row, "SELECT enable_delivery, enable_dine_in, enable_reservation FROM shops WHERE slug = ?", "102"); err != nil {
        t.Fatalf("load created shop failed: %v", err)
    }

    assert.Equal(t, int64(0), row.EnableDelivery)
    assert.Equal(t, int64(1), row.EnableDineIn)
    assert.Equal(t, int64(1), row.EnableReservation)
}
```

再补一个 fallback 用例：当 master settings 里没有这两个键时，新店也应显式写成 `1/1/1`，不允许再吃到数据库迁移的旧默认 `enable_reservation=0`。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `go test ./internal/handlers -run "TestMasterCreateShop"`

Expected: FAIL，因为当前 `INSERT INTO shops` 没有写 `enable_reservation` / `enable_delivery` / `enable_dine_in`

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `../foos2Go/internal/handlers/master_shop_admin.go` 的 `handleCreateShop()` 中：
- 读取 `settings := getMasterSettingsMap()`
- 用小 helper 从 settings 解析布尔启用态：
  - `reservation_enabled` 缺失时默认 `1`
  - `delivery_enabled` 缺失时默认 `1`
  - `enable_dine_in` 本步骤固定显式写 `1`
- 把 `INSERT INTO shops (...)` 扩成包含：
  - `enable_delivery`
  - `enable_dine_in`
  - `enable_reservation`

不要把这步扩成“新店自动继承费率覆盖值”；这里只修渠道启用默认值。

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `go test ./internal/handlers -run "TestMasterCreateShop"`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ../foos2Go/internal/handlers/master_shop_admin.go ../foos2Go/internal/handlers/master_create_shop_test.go
git commit -m "fix(master): seed new shops with global channel defaults"
```

---

## Task 3: 让预约提成覆盖真正持久化并出现在 master/init 回包

**Files:**
- Modify: `../foos2Go/internal/handlers/master_shop_admin.go`
- Modify: `../foos2Go/internal/handlers/master_init_data.go`
- Modify: `../foos2Go/internal/handlers/master_manage_actions_test.go`

- [ ] **Step 1: 先写会失败的 Go 回归测试**

在 `../foos2Go/internal/handlers/master_manage_actions_test.go` 里新增测试，覆盖“global 店铺改预约费率后刷新仍可见”：

```go
func TestMasterManageUpdateShopPersistsReservationOverrideInInitResponse(t *testing.T) {
    shopID := setupMasterManageTestDB(t)

    r := gin.New()
    r.PUT("/api/master/shops/:id", MasterUpdateShop)
    r.GET("/api/master/init", MasterInitData)

    body, _ := json.Marshal(map[string]interface{}{
        "id": shopID,
        "name": "Shop 02 Updated",
        "slug": "02-new",
        "status": "active",
        "commissionMode": "override",
        "reservation_enabled": 1,
        "reservation_commission_type": "per_order",
        "reservation_commission_value": 18,
        "delivery_enabled": 1,
        "delivery_commission_type": "percentage",
        "delivery_commission_value": 6,
    })

    req := httptest.NewRequest(http.MethodPut, "/api/master/shops/1", bytes.NewReader(body))
    req.Header.Set("Authorization", mustMasterAuthHeader(t))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    r.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
    }

    initReq := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
    initReq.Header.Set("Authorization", mustMasterAuthHeader(t))
    initW := httptest.NewRecorder()
    r.ServeHTTP(initW, initReq)

    if initW.Code != http.StatusOK {
        t.Fatalf("expected 200 from init, got %d body=%s", initW.Code, initW.Body.String())
    }

    // 找到 shopID 后断言：
    // found["reservation_commission_type"] == "per_order"
    // found["reservation_commission_value"] == 18
    // found["commission_mode"] == "override"
}
```

再补一个 global 用例：当 payload 带 `commissionMode: "global"` 时，历史预约覆盖值可以留在 settings，但 `MasterInitData` 不应把它作为 active override 再回给前端。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `go test ./internal/handlers -run "TestMasterManageUpdateShop"`

Expected: FAIL，因为当前 Go 后端只持久化 delivery override，预约字段只存在于前端和测试 payload，刷新回包不会返回预约覆盖值。

- [ ] **Step 3: 实现最小代码让测试变绿**

在 `../foos2Go/internal/handlers/master_shop_admin.go` 里：
- 继续保留现有 delivery override 逻辑
- 从 payload 里解析：
  - `reservation_commission_type`
  - `reservation_commission_value`
- 当 `commissionMode == "override"` 时，把预约覆盖值写进 `shops.settings`
  - 推荐键名：`reservation_commission_type` / `reservation_commission_value`
- 当 `commissionMode == "global"` 时，不把这些值当 active override 输出给前端
  - 可以保留历史值在 settings 中，但 `MasterInitData` 必须按 mode 做投影筛选

在 `../foos2Go/internal/handlers/master_init_data.go` 里：
- 解析每家店 `settings` JSON
- 仅当 `commission_mode == "override"` 且 settings 中存在预约覆盖值时，在响应 map 上补：
  - `reservation_commission_type`
  - `reservation_commission_value`
- 继续保留现有 `enable_reservation` 顶层字段，避免前台/预约 gate 回归

不要在这一步新增 reservation 计费逻辑；这里只修“编辑后刷新读不到”的 persistence gap。

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `go test ./internal/handlers -run "TestMasterManageUpdateShop"`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add ../foos2Go/internal/handlers/master_shop_admin.go ../foos2Go/internal/handlers/master_init_data.go ../foos2Go/internal/handlers/master_manage_actions_test.go
git commit -m "fix(master): persist reservation fee overrides"
```

---

## Task 4: 集成验证“01 之外的店铺也能改，新店 102 继承全局开关”

**Files:**
- Test: `src/lib/master-shop-edit-payload.test.ts`
- Test: `src/pages/master/master-billing-ui.test.ts`
- Test: `../foos2Go/internal/handlers/master_create_shop_test.go`
- Test: `../foos2Go/internal/handlers/master_manage_actions_test.go`

- [ ] **Step 1: 跑前端聚焦测试**

Run:
- `node --test src/lib/master-shop-edit-payload.test.ts`
- `node --test src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 2: 跑后端聚焦测试**

Run: `go test ./internal/handlers -run "TestMaster(CreateShop|ManageUpdateShop)"`

Expected: PASS

- [ ] **Step 3: 做一次本地手工 smoke**

Run:
- 前端仓库：`pnpm dev`
- 后端仓库：`go run ./cmd/server`

Manual checklist:
1. 在 master 全局设置里确认 `预约=开启`、`外卖=开启`
2. 新建 `102`
3. 刷新 master 列表，确认 `102` 显示 `预订 3% 全局默认`（或当前全局预订值），且不是默认关闭
4. 编辑 `02`，把外卖从 `5%` 改成 `6%`，保存并刷新，确认显示 `外卖 6% 店铺覆盖`
5. 编辑 `03`，只改预约提成，保存并刷新，确认预约文案变成店铺覆盖值
6. 对 `02` 点击“恢复全局默认”，保存并刷新，确认回到全局默认文案

- [ ] **Step 4: 记录验证结果并清理临时观察代码**

确认没有留下临时 `console.log` / 调试输出 / 额外报警文案。

- [ ] **Step 5: 提交**

```bash
git add src/lib/master-shop-edit-payload.test.ts src/pages/master/master-billing-ui.test.ts ../foos2Go/internal/handlers/master_create_shop_test.go ../foos2Go/internal/handlers/master_manage_actions_test.go
git commit -m "test: cover shop fee save regressions"
```

---

## Notes for the implementer

- 这个计划**不处理**“编辑面板里外卖/预约有两组重复开关”的 UI 去重；那是下一个独立任务。
- 当前 bug 的关键不是表单渲染，而是：
  1. `global` 店铺编辑后没有自动进入 `override`
  2. 新店创建吃到了数据库迁移遗留默认 `enable_reservation=0`
  3. 预约覆盖值只活在前端 payload 里，Go 刷新回包不投影
- 不要在实现时顺手改堂食订阅、admin 账单文案、表格布局。这些都不属于本计划。
