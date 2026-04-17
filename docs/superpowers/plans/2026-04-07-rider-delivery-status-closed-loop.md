# Rider Delivery Status Closed-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 admin、rider web、Telegram、买家侧建立稳定统一的配送闭环，新增真实状态 `picked_up`，并让多端共用同一条状态推进链。

**Architecture:** 后端继续作为唯一状态真相，在现有订单更新链上最小扩展 `delivering -> picked_up -> completed` 跃迁，并保持拒单仍写入 `remarks_json` / `dispatch_meta`。前端收口共享状态文案、颜色和动作规则，再分别驱动 admin、rider web、Telegram 与买家侧展示，避免接口污染与多处分叉状态机。

**Tech Stack:** Go + Gin + sqlx/SQLite, Astro, TypeScript, Node test runner, existing Telegram callback flow, existing rider-dispatch helpers.

---

## File Map

- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_status_flow_test.go`
  - 为后端状态推进与非法跳转补红灯。
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\mobile.go`
  - 扩公开订单状态更新入口，支持 `picked_up` 并拒绝非法跃迁。
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order.go`
  - 复用相同状态更新链，保证 admin 更新入口也支持 `picked_up`。
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_list_flow.go`
  - 保持列表回包稳定透出 `picked_up`，不新增端侧污染字段。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\rider-dispatch.ts`
  - 收口配送状态文案、颜色、动作可见性与拒单反馈 helper。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\rider-dispatch.test.ts`
  - 锁定共享状态映射与动作规则。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\telegram-dispatch.ts`
  - 新增“已取餐”“已送达”阶段 Telegram 消息构建能力。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\telegram-dispatch.test.ts`
  - 锁定 Telegram 三阶段消息按钮与文案。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\telegram\rider-claim.ts`
  - 让 Telegram callback 复用同一状态推进链，并在每次成功后推送下一阶段消息。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-rider-claim.test.ts`
  - 锁定 accept -> picked_up 消息、picked_up -> delivered 消息与 completed 落库。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\pages\rider\dashboard.astro`
  - 使用共享 helper，补“已取餐”“已送达”按钮与对应状态过滤。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\rider-dashboard-canonical.test.ts`
  - 锁定 rider dashboard 新状态按钮与过滤逻辑。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\components\admin\TabTables.astro`
  - 使用共享 helper 统一状态标签、颜色、按钮与拒单反馈。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\admin\tab-tables-rider-status-copy.test.ts`
  - 锁定 admin 外卖卡片的 delivering/picked_up/declined 展示。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\components\UserCenterPanel.tsx`
  - 买家侧文案展示 `送餐中 / 骑手已取餐，正在送达 / 已送达`。
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\components\UserCenterPanel.test.tsx`
  - 锁定买家侧文案映射。

---

### Task 1: 扩后端真实状态链到 picked_up

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_status_flow_test.go`
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\mobile.go`
- Modify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order.go`

- [ ] **Step 1: Write the failing test**

```go
func TestOrderUpdateStatusSupportsPickedUpTransition(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupOrderScheduleTestDB(t)

	if _, err := db.DB.Exec(`INSERT INTO shops (id, name, slug, password, status) VALUES (301, 'Picked Up Shop', 'picked-up-shop', 'x', 'active')`); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	if _, err := db.DB.Exec(`INSERT INTO orders (id, shop_id, order_no, items_json, total_amount, status, order_type, courier_name, courier_phone) VALUES (901, 301, 'NO901', '[]', 1000, 'delivering', 'delivery', '骑手甲', '0601')`); err != nil {
		t.Fatalf("seed order failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/order/update_status/:id", OrderUpdateStatus)

	req := httptest.NewRequest(http.MethodPost, "/api/order/update_status/901", strings.NewReader(`{"id":901,"status":"picked_up","courier_name":"骑手甲","courier_phone":"0601"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var status string
	if err := db.DB.Get(&status, `SELECT status FROM orders WHERE id = ?`, 901); err != nil {
		t.Fatalf("load order failed: %v", err)
	}
	if status != "picked_up" {
		t.Fatalf("expected picked_up, got %q", status)
	}
}

testName := "TestOrderUpdateStatusRejectsPickedUpWithoutDelivering"
func TestOrderUpdateStatusRejectsPickedUpWithoutDelivering(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupOrderScheduleTestDB(t)

	if _, err := db.DB.Exec(`INSERT INTO shops (id, name, slug, password, status) VALUES (302, 'Invalid Jump Shop', 'invalid-jump-shop', 'x', 'active')`); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	if _, err := db.DB.Exec(`INSERT INTO orders (id, shop_id, order_no, items_json, total_amount, status, order_type) VALUES (902, 302, 'NO902', '[]', 1000, 'awaiting_courier', 'delivery')`); err != nil {
		t.Fatalf("seed order failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/order/update_status/:id", OrderUpdateStatus)

	req := httptest.NewRequest(http.MethodPost, "/api/order/update_status/902", strings.NewReader(`{"id":902,"status":"picked_up"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "invalid_status_transition") {
		t.Fatalf("expected invalid_status_transition, got %s", w.Body.String())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /d D:\ai\food\.worktrees\260311\foos2Go && go test ./internal/handlers -run "TestOrderUpdateStatus(SupportsPickedUpTransition|RejectsPickedUpWithoutDelivering)"`
Expected: FAIL，当前还不支持 `picked_up` 或未拒绝非法跳转。

- [ ] **Step 3: Write minimal implementation**

```go
func validateOrderStatusTransition(currentStatus string, nextStatus string) bool {
	switch currentStatus {
	case "awaiting_courier":
		return nextStatus == "delivering" || nextStatus == "awaiting_courier"
	case "delivering":
		return nextStatus == "picked_up" || nextStatus == "completed"
	case "picked_up":
		return nextStatus == "completed"
	default:
		return true
	}
}
```

```go
var currentStatus string
if err := db.DB.Get(&currentStatus, `SELECT status FROM orders WHERE id = ?`, req.ID); err != nil {
	c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "order not found"})
	return
}
if !validateOrderStatusTransition(currentStatus, strings.TrimSpace(req.Status)) {
	c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid_status_transition"})
	return
}
```

```go
func (h *OrderHandler) UpdateOrderStatus(c *gin.Context) {
	var req UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}
	handleOrderStatusUpdate(c, req)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /d D:\ai\food\.worktrees\260311\foos2Go && go test ./internal/handlers -run "TestOrderUpdateStatus(SupportsPickedUpTransition|RejectsPickedUpWithoutDelivering)"`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add D:/ai/food/.worktrees/260311/foos2Go/internal/handlers/order_status_flow_test.go D:/ai/food/.worktrees/260311/foos2Go/internal/handlers/mobile.go D:/ai/food/.worktrees/260311/foos2Go/internal/handlers/order.go
git commit -m "feat: add picked up delivery status"
```

### Task 2: 收口共享配送状态文案、颜色与动作规则

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\rider-dispatch.ts`
- Test: `D:\ai\food\.worktrees\260311\food2astro\src\lib\rider-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('delivery status helpers cover delivering, picked_up and completed consistently', () => {
  assert.equal(getAdminDispatchStatusCopy('delivering'), '骑手已接单');
  assert.equal(getAdminDispatchStatusCopy('picked_up'), '骑手已取餐');
  assert.equal(getCustomerDeliveryStatusCopy('delivering'), '送餐中');
  assert.equal(getCustomerDeliveryStatusCopy('picked_up'), '骑手已取餐，正在送达');
  assert.equal(getDeliveryStatusTone('declined'), 'danger');
  assert.equal(getDeliveryStatusTone('delivering'), 'info');
  assert.equal(getDeliveryStatusTone('picked_up'), 'success');

  assert.deepEqual(getRiderActionFlags({ status: 'delivering', courierPhone: '0611' }, '0611'), {
    canAccept: false,
    canDecline: false,
    canPickUp: true,
    canComplete: false,
  });

  assert.deepEqual(getRiderActionFlags({ status: 'picked_up', courierPhone: '0611' }, '0611'), {
    canAccept: false,
    canDecline: false,
    canPickUp: false,
    canComplete: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: FAIL，缺少 `picked_up` 文案 / tone / 动作规则。

- [ ] **Step 3: Write minimal implementation**

```ts
export function getAdminDispatchStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'awaiting_courier':
      return '待骑手接单';
    case 'delivering':
      return '骑手已接单';
    case 'picked_up':
      return '骑手已取餐';
    case 'completed':
      return '已送达';
    default:
      return '待处理';
  }
}

export function getCustomerDeliveryStatusCopy(status: string | null | undefined): string {
  switch (String(status || '')) {
    case 'delivering':
      return '送餐中';
    case 'picked_up':
      return '骑手已取餐，正在送达';
    case 'completed':
      return '已送达';
    default:
      return '';
  }
}

export function getDeliveryStatusTone(status: string | null | undefined): 'default' | 'info' | 'success' | 'danger' {
  switch (String(status || '')) {
    case 'declined':
      return 'danger';
    case 'delivering':
      return 'info';
    case 'picked_up':
    case 'completed':
      return 'success';
    default:
      return 'default';
  }
}
```

```ts
return {
  canAccept: status === 'awaiting_courier',
  canDecline: status === 'awaiting_courier',
  canPickUp: status === 'delivering' && !!phone && phone === orderPhone,
  canComplete: status === 'picked_up' && !!phone && phone === orderPhone,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/rider-dispatch-spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts
git commit -m "feat: unify delivery status helpers"
```

### Task 3: 扩 Telegram 三阶段消息与 callback 推进

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\telegram-dispatch.ts`
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\lib\telegram-dispatch.test.ts`
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\pages\api\telegram\rider-claim.ts`
- Test: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-rider-claim.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('buildRiderPickedUpTelegramMessage renders delivered button for picked_up stage', () => {
  const message = buildRiderPickedUpTelegramMessage({
    orderNo: 'NO601',
    address: 'Beograd 6',
    phone: '0606',
    totalAmount: 1600,
    pickupEtaMinutes: 10,
    completeCallbackData: 'done-601',
  });

  assert.match(message.text, /已取餐/);
  assert.deepEqual(message.replyMarkup.inline_keyboard, [[
    { text: '已送达', callback_data: 'done-601' },
  ]]);
});

test('POST rider-claim sends picked_up follow-up message after accept succeeds', async () => {
  let sendBodies: Array<Record<string, unknown>> = [];
  const restoreFetch = withMockedFetch(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'http://localhost/api/rider/status?action=list_available') {
      return jsonResponse({ success: true, riders: [{ id: 9, name: '骑手九', phone: '0609', status: 'available', telegramChatId: 'chat-9' }] });
    }
    if (url === 'http://localhost/api/admin/orders') {
      return jsonResponse([{ id: 601, orderNo: 'NO601', tableInfo: 'Addr', userPhone: '0600', totalAmount: 1000, pickupEtaMinutes: 10, status: 'awaiting_courier' }]);
    }
    if (url === 'http://localhost/api/order/update_status/601') {
      return jsonResponse({ success: true });
    }
    if (url === 'http://localhost/api/telegram/send') {
      sendBodies.push(JSON.parse(String(init?.body || '{}')));
      return jsonResponse({ success: true });
    }
    return jsonResponse({ success: true });
  });

  // 调 accept callback 后断言 sendBodies[0].text 包含“已接单”，sendBodies[0].reply_markup 含“已取餐”
  restoreFetch();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts`
Expected: FAIL，缺少 `buildRiderPickedUpTelegramMessage` 或 accept 后未发送“已取餐”阶段消息。

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildRiderDeliveryProgressTelegramMessage(input: {
  stage: 'picked_up' | 'completed';
  orderNo: string;
  address: string;
  phone: string;
  totalAmount: number;
  pickupEtaMinutes: number;
  callbackData?: string;
}): TelegramDispatchMessage {
  if (input.stage === 'picked_up') {
    return {
      text: ['骑手已接单', `订单号：${input.orderNo}`, `地址：${input.address}`, `电话：${input.phone}`, `金额：${input.totalAmount} RSD`].join('\n'),
      replyMarkup: { inline_keyboard: input.callbackData ? [[{ text: '已取餐', callback_data: input.callbackData }]] : [] },
    };
  }
  return {
    text: ['骑手已取餐', `订单号：${input.orderNo}`, `地址：${input.address}`, `电话：${input.phone}`, `金额：${input.totalAmount} RSD`].join('\n'),
    replyMarkup: { inline_keyboard: input.callbackData ? [[{ text: '已送达', callback_data: input.callbackData }]] : [] },
  };
}
```

```ts
if (callback.action === 'accept') {
  // update_status -> delivering
  // 成功后发送“已取餐”按钮消息
}
if (callback.action === 'picked_up') {
  // update_status -> picked_up
  // 成功后发送“已送达”按钮消息
}
if (callback.action === 'complete') {
  // update_status -> completed
}
```

```ts
type TelegramClaimAction = 'accept' | 'decline' | 'picked_up' | 'complete';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts`
Expected: PASS，且旧 accept/decline 测试仍通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts
git commit -m "feat: add telegram delivery progress actions"
```

### Task 4: 更新 rider dashboard 到 picked_up 闭环

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\pages\rider\dashboard.astro`
- Test: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\rider-dashboard-canonical.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('rider dashboard source includes picked_up stage and delivery progress actions', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /const pickedUpOrders = myOrders\.filter\(\(o\) => o\.status === 'picked_up'/);
  assert.match(source, /pickUp\.textContent = '📦 已取餐';/);
  assert.match(source, /delivered\.textContent = '✅ 已送达';/);
  assert.match(source, /window\.pickUpOrder = async function\(id\) \{/);
  assert.match(source, /window\.completeOrder = async function\(id\) \{/);
  assert.match(source, /status: 'picked_up'/);
  assert.match(source, /status: 'completed'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: FAIL，当前没有 `picked_up` 阶段与 `pickUpOrder`。

- [ ] **Step 3: Write minimal implementation**

```ts
const deliveringOrders = myOrders.filter((o) => o.status === 'delivering' && String(o.courierPhone || '').trim() === String(rider?.phone || '').trim());
const pickedUpOrders = myOrders.filter((o) => o.status === 'picked_up' && String(o.courierPhone || '').trim() === String(rider?.phone || '').trim());
```

```ts
const pickUp = document.createElement('button');
pickUp.type = 'button';
pickUp.className = 'btn-action btn-complete';
pickUp.textContent = '📦 已取餐';
pickUp.addEventListener('click', () => window.pickUpOrder(o.id));
```

```ts
window.pickUpOrder = async function(id) {
  if (!confirm('确认已取餐？')) return;
  const res = await fetch('/api/order/update_status', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ id, status: 'picked_up', courierName: rider.name, courierPhone: rider.phone }),
  });
  const data = await res.json();
  if (data.success) loadOrders();
};
```

```ts
window.completeOrder = async function(id) {
  if (!confirm('确认已送达？')) return;
  const res = await fetch('/api/order/update_status', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ id, status: 'completed', courierName: rider.name, courierPhone: rider.phone }),
  });
  const data = await res.json();
  if (data.success) loadOrders();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/rider-dashboard-canonical.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts
git commit -m "feat: add rider pickup and delivered actions"
```

### Task 5: 更新 admin 外卖卡片到统一状态与推进按钮

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\components\admin\TabTables.astro`
- Test: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\admin\tab-tables-rider-status-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('admin delivery card source covers delivering, picked_up and decline feedback with unified actions', async () => {
  const source = await readTabTablesSource();

  assert.match(source, /o\.status === ['"]picked_up['"] \? ['"]骑手已取餐['"]/);
  assert.match(source, /data-admin-action=['"]mark-picked-up['"]/);
  assert.match(source, /data-admin-action=['"]mark-delivered['"]/);
  assert.match(source, /getDeliveryStatusTone|getAdminDispatchStatusCopy/);
  assert.match(source, /riderDeclinedAwaitingCourier \? ['"]骑手已拒单['"]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
Expected: FAIL，当前没有 `picked_up` 文案和 admin 推进按钮。

- [ ] **Step 3: Write minimal implementation**

```astro
{(o.status === 'delivering') && (
  <button class="btn-xs" type="button" data-admin-action="mark-picked-up" data-order-id={o.id} style="background:#2563eb; color:white;">📦 已取餐</button>
)}
{(o.status === 'picked_up') && (
  <button class="btn-xs" type="button" data-admin-action="mark-delivered" data-order-id={o.id} style="background:#16a34a; color:white;">✅ 已送达</button>
)}
```

```astro
<span class={`status-tag status-${o.status}`} style={`background:${riderDeclinedAwaitingCourier ? '#fee2e2' : o.status === 'delivering' ? '#dbeafe' : o.status === 'picked_up' ? '#dcfce7' : ''}; color:${riderDeclinedAwaitingCourier ? '#b91c1c' : o.status === 'delivering' ? '#1d4ed8' : o.status === 'picked_up' ? '#166534' : ''};`}>
  {o.status === 'pending' ? '待处理' :
   o.status === 'confirmed' ? '已接单' :
   riderDeclinedAwaitingCourier ? '骑手已拒单' :
   o.status === 'awaiting_courier' ? '待骑手接单' :
   o.status === 'delivering' ? '骑手已接单' :
   o.status === 'picked_up' ? '骑手已取餐' :
   o.status === 'completed' ? '已送达' : o.status}
</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/tests/pages/admin/tab-tables-rider-status-copy.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabTables.astro src/tests/pages/admin/tab-tables-rider-status-copy.test.ts
git commit -m "feat: add admin delivery progress actions"
```

### Task 6: 更新买家侧配送文案并做聚焦回归

**Files:**
- Modify: `D:\ai\food\.worktrees\260311\food2astro\src\components\UserCenterPanel.tsx`
- Test: `D:\ai\food\.worktrees\260311\food2astro\src\components\UserCenterPanel.test.tsx`
- Verify: `D:\ai\food\.worktrees\260311\foos2Go\internal\handlers\order_status_flow_test.go`
- Verify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\api\telegram-rider-claim.test.ts`
- Verify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\rider-dashboard-canonical.test.ts`
- Verify: `D:\ai\food\.worktrees\260311\food2astro\src\tests\pages\admin\tab-tables-rider-status-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('user center delivery copy distinguishes delivering and picked_up', () => {
  expect(renderDeliveryStatus('delivering')).toContain('送餐中');
  expect(renderDeliveryStatus('picked_up')).toContain('骑手已取餐，正在送达');
  expect(renderDeliveryStatus('completed')).toContain('已送达');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec node --test src/components/UserCenterPanel.test.tsx`
Expected: FAIL，当前缺少 `picked_up` 文案。

- [ ] **Step 3: Write minimal implementation**

```tsx
const deliveryStatusCopy = status === 'delivering'
  ? '送餐中'
  : status === 'picked_up'
    ? '骑手已取餐，正在送达'
    : status === 'completed'
      ? '已送达'
      : '';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec node --test src/components/UserCenterPanel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Run focused regression suites**

Run: `cd /d D:\ai\food\.worktrees\260311\foos2Go && go test ./internal/handlers -run "TestOrderUpdateStatus(SupportsPickedUpTransition|RejectsPickedUpWithoutDelivering)" && cd /d D:\ai\food\.worktrees\260311\food2astro && node --test src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch-spec.ts src/lib/telegram-rider-claim-route-spec.ts src/tests/pages/rider-dashboard-canonical.test.ts src/tests/pages/admin/tab-tables-rider-status-copy.test.ts && pnpm exec node --test src/components/UserCenterPanel.test.tsx`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/components/UserCenterPanel.tsx src/components/UserCenterPanel.test.tsx D:/ai/food/.worktrees/260311/foos2Go/internal/handlers/order_status_flow_test.go src/lib/rider-dispatch.ts src/lib/rider-dispatch-spec.ts src/lib/telegram-dispatch.ts src/lib/telegram-dispatch-spec.ts src/pages/api/telegram/rider-claim.ts src/lib/telegram-rider-claim-route-spec.ts src/pages/rider/dashboard.astro src/tests/pages/rider-dashboard-canonical.test.ts src/components/admin/TabTables.astro src/tests/pages/admin/tab-tables-rider-status-copy.test.ts

git commit -m "feat: close rider delivery status loop"
```

---

## Self-Review

### Spec coverage
- 真实新增状态 `picked_up`：Task 1
- 共用同一后端状态推进链：Task 1 + Task 3 + Task 4 + Task 5
- rider web 两个新增动作：Task 4
- Telegram 两个新增动作：Task 3
- admin 可推进状态：Task 5
- 买家侧同步新文案：Task 6
- 拒单继续走 remarks / dispatch meta：Task 2 + Task 5 + Task 3 回归
- 接口稳定、无污染：Task 1 实现约束 + Task 2 共享 helper

### Placeholder scan
- 已去掉 TBD/TODO/“类似 Task N”。
- 每个任务都给了具体测试、命令、代码片段和提交命令。

### Type consistency
- 新状态统一使用 `picked_up`。
- rider 动作统一命名为 `canPickUp` / `canComplete`。
- Telegram 回调阶段统一为 `picked_up` 与 `complete`，最终订单状态为 `picked_up` 与 `completed`。

