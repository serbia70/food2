# MQTT Secret Backward Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让后端在旧版 `shops` 表缺少 `mqtt_secret` 列时仍能正常返回 `/02/info`、主控初始化数据和部分后台接口，避免线上旧库直接 500。

**Architecture:** 先做后端查询兼容，不强依赖 `shops.mqtt_secret` 列存在。通过统一的 schema 检测/安全查询辅助函数，把读取 `mqtt_secret` 的地方改成“列存在则读取，不存在则回退为空值”，优先恢复读接口与非打印核心流程；保留后续正式迁移补列空间。

**Tech Stack:** Go, Gin, sqlx, SQLite

---

### Task 1: 添加 `shops.mqtt_secret` 列存在性探测工具

**Files:**
- Modify: `meituanGo/internal/handlers/shop_helpers.go`
- Test: `meituanGo/internal/handlers/*compat*_test.go`（新建兼容性测试文件）

**Step 1: Write the failing test**

写一个最小测试，创建不含 `mqtt_secret` 列的 `shops` 测试表，验证新的辅助函数能返回“列不存在”且不报错。

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestHasShopMQTTSecretColumn -count=1`
Expected: FAIL，因为辅助函数尚不存在。

**Step 3: Write minimal implementation**

在 `meituanGo/internal/handlers/shop_helpers.go` 增加：
- `hasShopMQTTSecretColumn() bool`
- 必要时增加内部缓存，避免每次请求都跑 `PRAGMA table_info(shops)`

实现要求：
- 列存在返回 `true`
- 列不存在返回 `false`
- 查询失败时保守返回 `false` 并记录日志

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestHasShopMQTTSecretColumn -count=1`
Expected: PASS

---

### Task 2: 修复 `/[slug]/info` 对旧库的兼容

**Files:**
- Modify: `meituanGo/internal/handlers/shop.go`
- Test: `meituanGo/internal/handlers/*compat*_test.go`

**Step 1: Write the failing test**

写一个处理器测试：
- 创建不含 `mqtt_secret` 列的 `shops` 表
- 插入 `slug='02'` 的店铺
- 调用 `GetShopBySlug`
- 断言返回 200 且 JSON 包含 `slug: "02"`

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestGetShopBySlugWithoutMQTTSecretColumn -count=1`
Expected: FAIL，当前查询直接选取 `mqtt_secret` 会报错。

**Step 3: Write minimal implementation**

在 `meituanGo/internal/handlers/shop.go`：
- 根据 `hasShopMQTTSecretColumn()` 选择两套 `SELECT`
- 旧库路径不要查询 `mqtt_secret`
- 返回结构中 `MQTTSecret` 允许为空

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestGetShopBySlugWithoutMQTTSecretColumn -count=1`
Expected: PASS

---

### Task 3: 修复主控初始化接口对旧库的兼容

**Files:**
- Modify: `meituanGo/internal/handlers/master_init_data.go`
- Test: `meituanGo/internal/handlers/*compat*_test.go`

**Step 1: Write the failing test**

写一个 `MasterInitData` 测试：
- 使用不含 `mqtt_secret` 的 `shops` 表
- 插入至少一个店铺
- 调用 `/api/master/init`
- 断言返回 200，`shops` 数组可解析

**Step 2: Run test to verify it fails**

Run: `go test ./internal/handlers -run TestMasterInitDataWithoutMQTTSecretColumn -count=1`
Expected: FAIL，当前 SQL 固定选择 `mqtt_secret`。

**Step 3: Write minimal implementation**

在 `meituanGo/internal/handlers/master_init_data.go`：
- 为 `SELECT shops` 提供有列/无列两套查询
- 无列时对 `mqtt_secret` 填空字符串

**Step 4: Run test to verify it passes**

Run: `go test ./internal/handlers -run TestMasterInitDataWithoutMQTTSecretColumn -count=1`
Expected: PASS

---

### Task 4: 收敛其他直接读取 `mqtt_secret` 的读路径

**Files:**
- Modify: `meituanGo/internal/services/mqtt/mqtt.go`
- Modify: `meituanGo/internal/handlers/admin_ops.go`
- Modify: `meituanGo/internal/handlers/master_shop_admin.go`

**Step 1: Add guarded reads**

逐个处理以下读路径：
- `subscribeToAllStatus`
- `PublishOrder`
- 后台重打小票读取店铺信息
- 主控编辑店铺时读取旧 `mqtt_secret`

要求：
- 若列不存在，不返回 SQL 错误
- MQTT 相关逻辑可降级为“跳过基于 secret 的 topic”或“视为未配置”
- 不影响已有 `shop/{id}/orders` 兼容 topic

**Step 2: Verify focused tests or manual commands**

Run: `go test ./internal/handlers ./internal/services/mqtt -count=1`
Expected: 重点兼容测试通过；若有历史无关失败，记录出来但不把新增兼容失败混在一起。

---

### Task 5: 端到端验证 `/02/info` 与服务启动

**Files:**
- Modify: `meituanGo/internal/db/migrations.go`（仅当必须补最小列迁移时）

**Step 1: Local run verification**

Run: `go run ./cmd/server`

检查：
- 服务可启动
- 不再因 `no such column: mqtt_secret` 直接导致 `/02/info` 报 500

**Step 2: Manual endpoint verification**

若本地有测试数据，验证：
- `/02/info`
- `/api/master/init`

**Step 3: Record deployment command**

整理给 VPS 的更新命令：

```bash
sudo systemctl stop meituan-go
go build -o server ./cmd/server
sudo systemctl restart meituan-go
sudo systemctl status meituan-go
journalctl -u meituan-go -n 80 --no-pager
```

---

### Task 6: 文档记录

**Files:**
- Modify: `docs/plans/2026-03-06-mqtt-secret-backward-compatibility.md`

**Step 1: Record implemented compatibility scope**

记录本轮已兼容的接口与限制：
- `/[slug]/info`
- `/api/master/init`
- MQTT secret 缺列时的退化行为

**Step 2: Record follow-up work**

记录后续正式动作：
- 给 `shops` 补正式迁移列
- 清理兼容分支
- 补更多 handler 覆盖测试
