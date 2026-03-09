# MQTT Chat Realtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MQTT-based real-time chat updates with audio notifications for user/admin chat panels.

**Architecture:** Reuse existing MQTT broker and Paho client on frontend. Publish chat events from backend on per-shop, per-user topics. Subscribe on user/admin UIs to append new messages and trigger audio/indicator.

**Tech Stack:** Go (gin + mqtt service), Astro/Preact, Paho MQTT over WebSocket

---

### Task 1: Define MQTT topic helpers (backend)

**Files:**
- Modify: `meituanGo/internal/services/mqtt/mqtt.go`

**Step 1: Write the failing test**

```go
// If no tests exist, add a lightweight test in mqtt package.
// Example (pseudo): TestChatTopicFormats
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/services/mqtt -run TestChatTopicFormats`
Expected: FAIL (test or helper missing)

**Step 3: Write minimal implementation**

Add helper functions:
```go
func ChatTopic(shopID int64, phone string) string {
    return fmt.Sprintf("shop/%d/chat/%s", shopID, phone)
}

func ChatWildcardTopic(shopID int64) string {
    return fmt.Sprintf("shop/%d/chat/+", shopID)
}
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/services/mqtt -run TestChatTopicFormats`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/services/mqtt/mqtt.go
git commit -m "feat: add chat mqtt topic helpers"
```

### Task 2: Publish chat messages from backend

**Files:**
- Modify: `meituanGo/internal/handlers/promotions.go`

**Step 1: Write the failing test**

```go
// Add a test in handlers or mqtt package to ensure publish is called.
// If no test harness exists, note manual verification instead.
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestChatPublish`
Expected: FAIL (publish not implemented)

**Step 3: Write minimal implementation**

- After successful user/admin send, publish:
```go
payload := map[string]any{
  "shop_id": shopID,
  "sender_role": "user|admin",
  "sender_phone": phone,
  "message": msg,
  "created_at": time.Now().UTC().Format(time.RFC3339),
}
err := mqtt.PublishChatMessage(shopID, phone, payload)
```

- Ensure publish failure does NOT fail HTTP response (log only).

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestChatPublish`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/handlers/promotions.go
git commit -m "feat: publish chat events to mqtt"
```

### Task 3: Add MQTT publish helper (backend)

**Files:**
- Modify: `meituanGo/internal/services/mqtt/mqtt.go`

**Step 1: Write the failing test**

```go
// Test publish formats topic + payload JSON.
```

**Step 2: Run test to verify it fails**

Run: `go test ./internal/services/mqtt -run TestPublishChatMessage`
Expected: FAIL

**Step 3: Write minimal implementation**

```go
func PublishChatMessage(shopID int64, phone string, payload any) error {
    topic := ChatTopic(shopID, phone)
    data, _ := json.Marshal(payload)
    return publish(topic, data)
}
```

**Step 4: Run test to verify it passes**

Run: `go test ./internal/services/mqtt -run TestPublishChatMessage`
Expected: PASS

**Step 5: Commit**

```bash
git add meituanGo/internal/services/mqtt/mqtt.go
git commit -m "feat: publish mqtt chat messages"
```

### Task 4: User chat MQTT subscribe + audio

**Files:**
- Modify: `meituanAstro/src/components/UserChat.astro`

**Step 1: Write the failing test**

```ts
// No existing frontend test harness; use manual verification steps.
```

**Step 2: Manual verification baseline**

Confirm chat only updates on refresh.

**Step 3: Implement subscription**

- Reuse Paho client in page (add if missing).
- Subscribe to `shop/{shopId}/chat/{phone}`.
- On message: parse JSON, append to UI; if panel closed, show badge + play sound.
- Add audio unlock on first user interaction.

**Step 4: Manual verification**

- Send from admin, user receives without refresh + audio.
- Send from user, admin receives without refresh + audio.

**Step 5: Commit**

```bash
git add meituanAstro/src/components/UserChat.astro
git commit -m "feat: realtime user chat via mqtt"
```

### Task 5: Admin chat MQTT subscribe + audio

**Files:**
- Modify: `meituanAstro/src/scripts/admin/mqtt-audio.ts`
- Modify: `meituanAstro/src/scripts/admin/user-chat.ts`

**Step 1: Write the failing test**

```ts
// Manual verification.
```

**Step 2: Manual verification baseline**

Confirm admin chat only updates on refresh.

**Step 3: Implement subscription**

- Subscribe to `shop/{shopId}/chat/+`.
- Filter by active user phone if needed.
- Append + badge + sound.

**Step 4: Manual verification**

- User sends, admin updates immediately with sound.

**Step 5: Commit**

```bash
git add meituanAstro/src/scripts/admin/mqtt-audio.ts meituanAstro/src/scripts/admin/user-chat.ts
git commit -m "feat: realtime admin chat via mqtt"
```

### Task 6: End-to-end verification

**Files:**
- None

**Step 1: Manual verification**

- User sends message: admin receives without refresh + sound
- Admin sends message: user receives without refresh + sound
- Check badges reset after opening panel

**Step 2: Document verification**

Add a short note to the plan or release notes if required.

**Step 3: Commit**

```bash
# Only if documentation changes were made
git add docs/...
git commit -m "docs: add mqtt chat verification notes"
```
