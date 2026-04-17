# Backend Single-Truth Orders API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `foos2Go` 成为订单相关 HTTP 契约的唯一真源：后端对外统一 camelCase，前端只消费 camelCase，删除运行时 test/debug 分叉，并最终删除 `foos2Go` 下全部 `_test.go`。

**Architecture:** 在 `foos2Go/internal/handlers` 下新增最小 DTO / mapper 边界，把数据库模型留在内部扫描层，handler 统一投影为稳定 camelCase HTTP DTO。前端与 BFF 同步删除 snake_case fallback，只保留鉴权、转发和最小必要的数据整理。最后删除运行时测试入口与 Go 测试文件，用构建、搜索和生产链路烟雾验证收尾。

**Tech Stack:** Go, Gin, sqlx, Astro, TypeScript, Preact, pnpm, SQLite

---

### Task 1: 固化后端 camelCase DTO 真源

**Files:**
- Create: `foos2Go/internal/handlers/order_dto.go`
- Create: `foos2Go/internal/handlers/user_dto.go`
- Create: `foos2Go/internal/handlers/rider_dto.go`
- Modify: `foos2Go/internal/handlers/mobile.go`
- Modify: `foos2Go/internal/handlers/order_list_flow.go`
- Modify: `foos2Go/internal/handlers/order_query_flow.go`

- [ ] **Step 1: 新增订单 DTO 文件，字段名固定为 camelCase，字段类型镜像现有 `db.Order`**

`foos2Go/internal/handlers/order_dto.go`

```go
package handlers

import "meituan-go/internal/db"

// 这里不重新发明内部类型；字段类型直接镜像 db.Order。
// 本文件只负责固定对外 JSON 命名为 camelCase。
type OrderDTO struct {
	ID int64 `json:"id"`

	OrderNo string `json:"orderNo"`
	ShopID int64 `json:"shopId"`
	RestaurantID *int64 `json:"restaurantId,omitempty"`
	TableInfo *string `json:"tableInfo,omitempty"`
	OrderType string `json:"orderType"`
	Status string `json:"status"`
	PrintStatus string `json:"printStatus"`
	TotalAmount int64 `json:"totalAmount"`

	ItemsJSON string `json:"itemsJson"`
	OriginalItems *string `json:"originalItems,omitempty"`
	OriginalItemsJSON *string `json:"originalItemsJson,omitempty"`
	RemarksJSON *string `json:"remarksJson,omitempty"`

	UserPhone *string `json:"userPhone,omitempty"`
	ScheduledFor *string `json:"scheduledFor,omitempty"`
	CreatedAt *string `json:"createdAt,omitempty"`
	UpdatedAt *string `json:"updatedAt,omitempty"`

	CourierPhone *string `json:"courierPhone,omitempty"`
	CourierName *string `json:"courierName,omitempty"`

	PickupEtaMinutes *int64 `json:"pickupEtaMinutes,omitempty"`
	PickupReadyAt *string `json:"pickupReadyAt,omitempty"`
	RiderBroadcastedAt *string `json:"riderBroadcastedAt,omitempty"`
	RiderLastRemindedAt *string `json:"riderLastRemindedAt,omitempty"`
	RiderRemindCount *int64 `json:"riderRemindCount,omitempty"`

	DispatchStatus *string `json:"dispatchStatus,omitempty"`
	DispatchRound *int64 `json:"dispatchRound,omitempty"`
	CurrentPoolIndex *int64 `json:"currentPoolIndex,omitempty"`
	LastDispatchedRiderID *int64 `json:"lastDispatchedRiderId,omitempty"`
	NextEscalateAt *string `json:"nextEscalateAt,omitempty"`
	EscalationCount *int64 `json:"escalationCount,omitempty"`

	Archived *int64 `json:"archived,omitempty"`
	ArchivedAt *string `json:"archivedAt,omitempty"`
	PaidAt *string `json:"paidAt,omitempty"`
	IsDeleted *int64 `json:"isDeleted,omitempty"`
	DeletedAt *string `json:"deletedAt,omitempty"`
	ModificationCount *int64 `json:"modificationCount,omitempty"`
	DeliveryFeeStatus *string `json:"deliveryFeeStatus,omitempty"`
	AllowAdd *int64 `json:"allowAdd,omitempty"`
	DeliveryInfo *string `json:"deliveryInfo,omitempty"`

	ShopName *string `json:"shopName,omitempty"`
}

func toOrderDTO(order db.Order) OrderDTO {
	return OrderDTO{
		ID: order.ID,
		OrderNo: order.OrderNo,
		ShopID: order.ShopID,
		RestaurantID: order.RestaurantID,
		TableInfo: order.TableInfo,
		OrderType: order.OrderType,
		Status: order.Status,
		PrintStatus: order.PrintStatus,
		TotalAmount: order.TotalAmount,
		ItemsJSON: order.ItemsJSON,
		OriginalItems: order.OriginalItems,
		OriginalItemsJSON: order.OriginalItemsJSON,
		RemarksJSON: order.RemarksJSON,
		UserPhone: order.UserPhone,
		ScheduledFor: order.ScheduledFor,
		CreatedAt: order.CreatedAt,
		UpdatedAt: order.UpdatedAt,
		CourierPhone: order.CourierPhone,
		CourierName: order.CourierName,
		PickupEtaMinutes: order.PickupEtaMinutes,
		PickupReadyAt: order.PickupReadyAt,
		RiderBroadcastedAt: order.RiderBroadcastedAt,
		RiderLastRemindedAt: order.RiderLastRemindedAt,
		RiderRemindCount: order.RiderRemindCount,
		DispatchStatus: order.DispatchStatus,
		DispatchRound: order.DispatchRound,
		CurrentPoolIndex: order.CurrentPoolIndex,
		LastDispatchedRiderID: order.LastDispatchedRiderID,
		NextEscalateAt: order.NextEscalateAt,
		EscalationCount: order.EscalationCount,
		Archived: order.Archived,
		ArchivedAt: order.ArchivedAt,
		PaidAt: order.PaidAt,
		IsDeleted: order.IsDeleted,
		DeletedAt: order.DeletedAt,
		ModificationCount: order.ModificationCount,
		DeliveryFeeStatus: order.DeliveryFeeStatus,
		AllowAdd: order.AllowAdd,
		DeliveryInfo: order.DeliveryInfo,
	}
}
```

- [ ] **Step 2: 新增用户与骑手 DTO，仍然只改对外命名，不改内部模型**

`foos2Go/internal/handlers/user_dto.go`

```go
package handlers

import "meituan-go/internal/db"

type UserDTO struct {
	ID int64 `json:"id"`
	Phone *string `json:"phone,omitempty"`
	Name *string `json:"name,omitempty"`
	LoginAccount *string `json:"loginAccount,omitempty"`
	LastAddress *string `json:"lastAddress,omitempty"`
	Email *string `json:"email,omitempty"`
	Avatar *string `json:"avatar,omitempty"`
	CreatedAt *string `json:"createdAt,omitempty"`
}

func toUserDTO(user db.User) UserDTO {
	return UserDTO{
		ID: user.ID,
		Phone: user.Phone,
		Name: user.Name,
		LoginAccount: user.LoginAccount,
		LastAddress: user.LastAddress,
		Email: user.Email,
		Avatar: user.Avatar,
		CreatedAt: user.CreatedAt,
	}
}
```

`foos2Go/internal/handlers/rider_dto.go`

```go
package handlers

import "meituan-go/internal/db"

type RiderDTO struct {
	ID int64 `json:"id"`
	Name string `json:"name"`
	Phone string `json:"phone"`
	Status string `json:"status"`
	TelegramChatID *string `json:"telegramChatId,omitempty"`
	CreatedAt *string `json:"createdAt,omitempty"`
}

func toRiderDTO(rider db.Rider) RiderDTO {
	return RiderDTO{
		ID: rider.ID,
		Name: rider.Name,
		Phone: rider.Phone,
		Status: rider.Status,
		TelegramChatID: rider.TelegramChatID,
		CreatedAt: rider.CreatedAt,
	}
}
```

- [ ] **Step 3: 把 `mobile.go` 的输入输出切到正式合同**

`foos2Go/internal/handlers/mobile.go`

把请求体字段统一改为 camelCase：

```go
type riderStatusRequest struct {
	ID int64 `json:"id"`
	Status string `json:"status"`
	TelegramChatID *string `json:"telegramChatId"`
}

type userHistoryRequest struct {
	LoginAccount string `json:"loginAccount"`
	Password string `json:"password"`
	SessionToken string `json:"sessionToken"`
}

type orderStatusRequest struct {
	ID int64 `json:"id"`
	Status string `json:"status"`
	ExpectedCurrentStatus string `json:"expectedCurrentStatus"`
	CourierName string `json:"courierName"`
	CourierPhone string `json:"courierPhone"`
	RemarksJSON string `json:"remarksJson"`
}
```

把以下输出统一改成 DTO：
- `RiderAuth` 登录回包：`"rider": toRiderDTO(rider)`
- `RiderStatus` GET：直接复用 `toRiderDTO`
- `RiderOrders`：先查内部 row，再映射为 `[]OrderDTO`
- `UserHistory` GET 分支：返回 `[]OrderDTO`
- `UserHistory` sessionToken 分支：返回 `[]OrderDTO`
- `UserHistory` 登录分支：返回 `toUserDTO(user)`
- `PublicOrdersByTable`：返回 camelCase 字段
- `OrderUpdateStatus`：只收 camelCase 请求字段

- [ ] **Step 3.1: 显式检查 `PublicOrderStatus`，确保它不再成为旁路契约**

`foos2Go/internal/handlers/mobile.go`

处理原则：
- `PublicOrderStatus` 虽然不是整单 DTO，但也必须只保留正式字段；
- 当前返回体继续维持：
  - `success`
  - `status`
  - `remarks`
- 不新增 snake_case key；
- 如果后续加字段，也只能加 camelCase，不允许借这个接口继续把 DB 形状漏出去。

目标形态：

```go
c.JSON(http.StatusOK, gin.H{
	"success": true,
	"status":  row.Status,
	"remarks": remarks,
})
```

- [ ] **Step 4: 把 admin 订单列表与单订单详情切到 DTO**

`foos2Go/internal/handlers/order_list_flow.go`

```go
var orders []db.Order
err := db.DB.Select(&orders, query, args...)
if err != nil { ... }

result := make([]OrderDTO, 0, len(orders))
for _, order := range orders {
	result = append(result, toOrderDTO(order))
}

c.JSON(http.StatusOK, result)
```

`foos2Go/internal/handlers/order_query_flow.go`

```go
var order db.Order
err = db.DB.Get(&order, "SELECT * FROM orders WHERE order_no = ? AND shop_id = ?", orderNo, shopID)
if err != nil { ... }

c.JSON(http.StatusOK, toOrderDTO(order))
```

- [ ] **Step 5: 验证后端正式合同只在 handler 层输出 camelCase**

Run: `cd foos2Go && go build ./...`  
Expected: build 成功

Run: `git grep -n 'json:"[^"]*_"' -- foos2Go/internal/handlers/*.go foos2Go/internal/handlers/*_dto.go`  
Expected: 不再出现订单/用户/骑手正式 HTTP DTO 与请求体里的 snake_case JSON tag

- [ ] **Step 6: Commit**

```bash
git add foos2Go/internal/handlers/order_dto.go foos2Go/internal/handlers/user_dto.go foos2Go/internal/handlers/rider_dto.go foos2Go/internal/handlers/mobile.go foos2Go/internal/handlers/order_list_flow.go foos2Go/internal/handlers/order_query_flow.go && git commit -m "refactor: make backend order contracts canonical camelCase"
```

---

### Task 2: 前端与 BFF 只消费 camelCase

**Files:**
- Modify: `food2astro/src/lib/rider-dispatch.ts`
- Modify: `food2astro/src/pages/orders/index.astro`
- Modify: `food2astro/src/pages/rider/dashboard.astro`
- Modify: `food2astro/src/pages/admin/[slug]/index.astro`
- Modify: `food2astro/src/pages/api/rider/orders.ts`
- Modify: `food2astro/src/pages/api/admin/orders.ts`
- Modify: `food2astro/src/pages/api/telegram/rider-claim.ts`
- Modify: `food2astro/src/lib/master-dispatch-loader.ts`
- Modify: `food2astro/src/pages/api/order/update_status.ts`

- [ ] **Step 1: 先把共享 helper 切成 camelCase-only**

`food2astro/src/lib/rider-dispatch.ts`

```ts
export function getRiderActionFlags(
  order: {
    status?: string | null;
    courierPhone?: string | null;
  },
  riderPhone?: string | null,
) {
  const status = String(order?.status || '').trim();
  const phone = String(riderPhone || '').trim();
  const orderPhone = String(order?.courierPhone || '').trim();
  const isCurrentRider = !!phone && phone === orderPhone;

  return {
    canAccept: status === 'awaiting_courier',
    canDecline: status === 'awaiting_courier',
    canPickUp: status === 'delivering' && isCurrentRider,
    canComplete: status === 'picked_up' && isCurrentRider,
  };
}
```

```ts
function readOrderActiveTimestamp(order: {
  pickupReadyAt?: string | null;
  riderBroadcastedAt?: string | null;
  createdAt?: string | null;
}): number {
  return parseTimestamp(
    String(order?.pickupReadyAt || order?.riderBroadcastedAt || order?.createdAt || ''),
  );
}
```

处理原则：
- 删除 `courierPhone || courier_phone`
- 删除 `pickupReadyAt || pickup_ready_at`
- 删除 `riderBroadcastedAt || rider_broadcasted_at`
- 删除 `createdAt || created_at`

- [ ] **Step 2: 删除 rider/admin BFF 的 snake_case 修补**

`food2astro/src/pages/api/rider/orders.ts`

```ts
const upstream = await fetch(url, init);
const data = await upstream.json();

return new Response(JSON.stringify(data), {
  status: upstream.status,
  headers: { 'Content-Type': 'application/json' },
});
```

删除：
- `normalizeRiderOrder`
- `order_no -> orderNo`
- `shop_name -> shopName`
- `table_info -> tableInfo`
- 其他 snake_case to camelCase 修补

`food2astro/src/pages/api/admin/orders.ts`
- 删除订单字段形状修补；
- 如果 `itemsJson` 修补仍存在，只有在后端已稳定输出后一起删除；
- 最终目标是轻转发，不再藏上游契约问题。

`food2astro/src/pages/api/order/update_status.ts`
- 只透传 `expectedCurrentStatus` / `courierName` / `courierPhone` / `remarksJson`

- [ ] **Step 3: 页面只读 camelCase，不再猜字段**

`food2astro/src/pages/rider/dashboard.astro`

```ts
const dispatchMeta = readDispatchMetaFromRemarks(o.remarksJson);
const actionFlags = getRiderActionFlags(o, rider?.phone);
```

删除：
- `o.remarksJson || o.remarks_json`
- `o.courierPhone || o.courier_phone`
- `o.pickupReadyAt || o.pickup_ready_at`
- `o.createdAt || o.created_at`

`food2astro/src/pages/admin/[slug]/index.astro`

```ts
const orders = rawOrders.map((o: Record<string, unknown>) => ({
  ...o,
  id: Number(o.id || 0),
  orderNo: String(o.orderNo || ''),
  orderType: String(o.orderType || ''),
  totalAmount: Number(o.totalAmount ?? 0),
  itemsJson: normalizeJSONString(o.itemsJson, '[]'),
  remarksJson: normalizeRemarkJSONString(o.remarksJson),
  tableInfo: String(o.tableInfo || ''),
  userPhone: String(o.userPhone || ''),
  scheduledFor: String(o.scheduledFor || ''),
  pickupEtaMinutes: Number(o.pickupEtaMinutes ?? 0),
  pickupReadyAt: String(o.pickupReadyAt || ''),
  riderBroadcastedAt: String(o.riderBroadcastedAt || ''),
  riderRemindCount: Number(o.riderRemindCount ?? 0),
  riderLastRemindedAt: String(o.riderLastRemindedAt || ''),
  courierName: String(o.courierName || ''),
  courierPhone: String(o.courierPhone || ''),
  createdAt: String(o.createdAt || ''),
  isDeleted: Number(o.isDeleted ?? 0),
}));
```

`food2astro/src/pages/orders/index.astro`
- 保留 `order.orderType` / `order.createdAt` / `order.remarksJson` / `order.courierPhone`
- 不新增任何 fallback

- [ ] **Step 4: Telegram / master 侧同步只读正式合同**

`food2astro/src/pages/api/telegram/rider-claim.ts`

```ts
function readRiderChatId(rider: AssignableRider): string {
  return String(rider.telegramChatId || '').trim();
}
```

```ts
const message = stage === 'picked_up'
  ? buildRiderPickedUpTelegramMessage({
      orderNo: String(order.orderNo || callback.orderId || '').trim(),
      address: String(order.tableInfo || '').trim() || '未提供地址',
      phone: String(order.userPhone || '').trim() || '-',
      totalAmount: Number(order.totalAmount || 0) || 0,
      pickupEtaMinutes: Number(order.pickupEtaMinutes || 0) || 0,
    })
  : ...
```

`food2astro/src/lib/master-dispatch-loader.ts`

```ts
return {
  awaiting: payload.awaiting.map((order) => ({
    id: order.id,
    orderNo: String(order.orderNo || order.id || '-'),
    shopId: Number(order.shopId || 0) || 0,
    shopName: String(order.shopName || '').trim(),
    status: String(order.status || '').trim(),
    dispatchStatus: String(order.dispatchStatus || 'idle').trim() || 'idle',
    dispatchRound: Number(order.dispatchRound || 0) || 0,
    lastDispatchedRiderId: String(order.lastDispatchedRiderId || ''),
  })),
};
```

- [ ] **Step 5: 验证前端 runtime 代码不再混读 snake_case**

Run: `pnpm build`  
Expected: build 成功

Run: `git grep -n -e "order_type" -e "created_at" -e "courier_phone" -e "remarks_json" -e "pickup_ready_at" -e "rider_broadcasted_at" -- food2astro/src`  
Expected: 订单运行时代码中不再出现这些字段 fallback

- [ ] **Step 6: Commit**

```bash
git add food2astro/src/lib/rider-dispatch.ts food2astro/src/pages/orders/index.astro food2astro/src/pages/rider/dashboard.astro food2astro/src/pages/admin/[slug]/index.astro food2astro/src/pages/api/rider/orders.ts food2astro/src/pages/api/admin/orders.ts food2astro/src/pages/api/telegram/rider-claim.ts food2astro/src/lib/master-dispatch-loader.ts food2astro/src/pages/api/order/update_status.ts && git commit -m "refactor: remove frontend snake case order fallbacks"
```

---

### Task 3: 删除运行时 test/debug 入口与 UI

**Files:**
- Modify: `foos2Go/internal/handlers/master_routes.go`
- Modify: `food2astro/src/scripts/master/settings-forms.ts`
- Modify: `food2astro/src/components/master/MasterServerSettingsCard.astro`
- Modify: `food2astro/src/scripts/admin/settings-ui.ts`
- Delete: `git grep` 命中的、只服务 runtime test/debug 的前端 API route 文件
- Delete: `git grep` 命中的、只服务 runtime test/debug 的后端 handler 文件

- [ ] **Step 1: 删除后端 `/telegram-test` 正式路由入口**

`foos2Go/internal/handlers/master_routes.go`

```go
// 删除这一行
master.POST("/telegram-test", MasterTelegramTest)
```

如果 `MasterTelegramTest` 只服务该路由，同步删除其实现文件。

- [ ] **Step 2: 删除 master 设置页测试消息链**

`food2astro/src/scripts/master/settings-forms.ts`
- 删除 `submitMasterServerTelegramTest`
- 删除 `/api/master/telegram-test` 调用
- 删除 form payload 里的 snake_case 双轨字段，只保留 camelCase

```ts
return {
  mqttBroker,
  telegramWebhookSecret,
  telegramChatId,
  telegramBotToken,
};
```

- [ ] **Step 3: 删除 test 按钮 UI**

`food2astro/src/components/master/MasterServerSettingsCard.astro`

```astro
<!-- 删除整个按钮 -->
<button
  type="button"
  class="settings-secondary"
  data-master-telegram-test-button
  onclick="return window.submitMasterServerTelegramTest ? window.submitMasterServerTelegramTest(this.form) : false;"
>
  发送测试信息
</button>
```

- [ ] **Step 4: 删除 admin 骑手 Telegram 测试链**

`food2astro/src/scripts/admin/settings-ui.ts`
- 删除 `/api/admin/rider-telegram-test` 调用
- 删除对应按钮、反馈文案、console 诊断输出
- 删除只为测试消息存在的状态分支

- [ ] **Step 5: 用搜索结果精确删除剩余 runtime test/debug 文件，不预设不存在的路径**

Run: `git grep -n -e "telegram-test" -e "rider-telegram-test" -e "发送测试信息" -e "测试消息" -- food2astro/src foos2Go/internal/handlers`  
Expected: 返回所有仍在生产树里的测试链路引用点

执行规则：
1. 先删调用点；
2. 再删路由注册；
3. 如果某个 API route / handler 文件只服务这条测试链路，直接删文件；
4. 如果文件还承载正式能力，只删测试分支，不顺手重构别的逻辑。

- [ ] **Step 6: 验证生产树中已无运行时测试链**

Run: `git grep -n -e "telegram-test" -e "rider-telegram-test" -e "发送测试信息" -e "测试消息" -- food2astro/src foos2Go/internal/handlers`  
Expected: 无输出

Run: `pnpm build && cd foos2Go && go build ./...`  
Expected: 前后端构建都成功

- [ ] **Step 7: Commit**

```bash
git add foos2Go/internal/handlers/master_routes.go food2astro/src/scripts/master/settings-forms.ts food2astro/src/components/master/MasterServerSettingsCard.astro food2astro/src/scripts/admin/settings-ui.ts food2astro/src/pages/api foos2Go/internal/handlers && git commit -m "refactor: remove runtime telegram test entrypoints"
```

---

### Task 4: 删除 `foos2Go` 全部 `_test.go` 并做最终清理验收

**Files:**
- Delete: `foos2Go/**/*_test.go`

- [ ] **Step 1: 列出全部待删 Go 测试文件**

Run: `git ls-files | grep '^foos2Go/.*_test\.go$'`  
Expected: 输出所有 `foos2Go` 下 `_test.go`

- [ ] **Step 2: 删除全部 Go 测试文件**

Run: `git ls-files | grep '^foos2Go/.*_test\.go$' | tr '\n' '\0' | xargs -0 git rm`  
Expected: 所有 `foos2Go` 测试文件进入删除状态

如果上一步为空，不补空提交，直接继续下一步验证。

- [ ] **Step 3: 验证仓库中不再保留 Go 测试文件**

Run: `git ls-files | grep '^foos2Go/.*_test\.go$'`  
Expected: 无输出

- [ ] **Step 4: 执行最终构建与搜索验收**

Run: `cd foos2Go && go build ./...`  
Expected: success

Run: `pnpm build`  
Expected: success

Run: `git grep -n -e "telegram-test" -e "rider-telegram-test" -- food2astro/src foos2Go/internal/handlers`  
Expected: 无输出

Run: `git grep -n -e "order_type" -e "created_at" -e "courier_phone" -e "remarks_json" -e "pickup_ready_at" -- food2astro/src`  
Expected: 订单运行时代码无 snake_case fallback

- [ ] **Step 5: 做生产链路烟雾验收**

手动验收清单：
- 买家下单后，`orders` 页面能看到自己的历史订单
- rider 页面能看到同一批 camelCase 订单对象
- Telegram 点击“已取餐”后，admin 展示为“骑手已取餐”，不是“已送达”
- `picked_up -> completed` 后 buyer/admin/rider 三端状态一致
- public table order 返回 `orderNo` / `totalAmount` / `itemsJson` / `createdAt` / `tableInfo`
- admin orders 与单订单详情回包不再出现 snake_case 字段

- [ ] **Step 6: Commit**

```bash
git add foos2Go food2astro && git commit -m "chore: remove backend go tests after api contract cleanup"
```

---

## Final Acceptance Checklist

- [ ] `foos2Go` 对外订单/用户/骑手 JSON 全部为 camelCase
- [ ] `db.Order` / `db.User` / `db.Rider` 不再直接作为 HTTP 返回体
- [ ] `UserHistory` 恢复买家历史订单可见
- [ ] `RiderOrders` / admin orders / public orders / single order 全部对齐正式合同
- [ ] `PublicOrderStatus` 仍只返回正式 key：`success` / `status` / `remarks`
- [ ] `food2astro` runtime 代码不再读取 snake_case 订单字段
- [ ] `/api/master/telegram-test` 与 admin rider telegram test 运行时链路已删除
- [ ] `foos2Go` 下不存在任何 `_test.go`
- [ ] 仓库中只保留一条真实生产链路
- [ ] implementation plan 不依赖未核实的测试文件路径或虚构 API 文件名

## Spec Coverage Self-Check

- 4.1/4.2 后端单一真源 + camelCase only：Task 1、Task 2
- 4.3 运行时只保留生产入口：Task 3
- 4.4 删除全部 `_test.go`：Task 4
- 5.1/5.2/5.3 DTO 分层与 order/user/rider DTO：Task 1
- 6.1 必须收口的 handler：Task 1
- 7.1/7.2/7.3 前端 BFF / 页面 / 状态 helper 收口：Task 2
- 8.1/8.2/8.3 删除范围：Task 3、Task 4
- 12/13 验证与验收：Task 4 Final Acceptance Checklist

## Placeholder Scan

- 无 `TODO`
- 无 `TBD`
- 无“类似前一步”式占位
- 无未核实测试路径硬编码
- 所有删除动作都以真实 grep / git ls-files 结果为准

## Type Consistency Check

- 后端内部继续使用 `db.Order` / `db.User` / `db.Rider`
- 对外 DTO 仅负责 camelCase 命名，不新增第二套业务含义
- 前端统一消费：
  - `orderNo`
  - `orderType`
  - `createdAt`
  - `courierPhone`
  - `remarksJson`
  - `pickupReadyAt`
  - `riderBroadcastedAt`
  - `telegramChatId`

## Recommended Execution Order

1. **先做 Task 1**
   - 先把后端 DTO 真源立住。
   - 没有这一步，前端删 fallback 只会先把线上打挂。

2. **再做 Task 2**
   - 前端和 BFF 改成 camelCase-only。
   - 重点先看：
     - `src/pages/orders/index.astro`
     - `src/pages/rider/dashboard.astro`
     - `src/pages/admin/[slug]/index.astro`
     - `src/pages/api/rider/orders.ts`
     - `src/pages/api/telegram/rider-claim.ts`

3. **再做 Task 3**
   - 删 runtime test/debug 分叉。
   - 这一步必须在主链路已跑通后做，避免半路失去验证入口。

4. **最后做 Task 4**
   - 删除 `foos2Go` 全部 `_test.go`
   - 放到最后，避免中途丢参考物。

## First Shipping Slice

如果要按最小闭环先打通，第一批必须同时完成这几处：

### Backend
- `foos2Go/internal/handlers/order_dto.go`
- `foos2Go/internal/handlers/user_dto.go`
- `foos2Go/internal/handlers/rider_dto.go`
- `foos2Go/internal/handlers/mobile.go`
- `foos2Go/internal/handlers/order_list_flow.go`
- `foos2Go/internal/handlers/order_query_flow.go`

### Frontend
- `food2astro/src/pages/orders/index.astro`
- `food2astro/src/pages/rider/dashboard.astro`
- `food2astro/src/pages/admin/[slug]/index.astro`
- `food2astro/src/lib/rider-dispatch.ts`
- `food2astro/src/pages/api/rider/orders.ts`
- `food2astro/src/pages/api/telegram/rider-claim.ts`

这一批完成后，先验证两件事：
1. 买家下单后能在 `orders` 页面看到自己的订单；
2. Telegram 点“已取餐”后，admin 显示“骑手已取餐”，不是“已送达”。

## Out-of-Scope Guardrails

实施时不要顺手做这些事：

- 不改数据库 schema
- 不加 v2 API
- 不保留 snake_case + camelCase 双轨输出
- 不新增前端兼容层
- 不为了“优雅”重构无关模块
- 不把删除 `_test.go` 提前到主链路打通之前

## Done Means

只有同时满足下面条件，这轮才算完成：

- 后端订单相关正式接口对外只输出 camelCase
- 前端不再读 snake_case fallback
- 买家订单历史恢复
- rider / Telegram / admin / buyer 状态展示一致
- runtime test/debug 路由和 UI 删除
- `foos2Go` 下不存在 `_test.go`
- 仓库里只剩一条真实生产链路
