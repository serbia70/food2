# Password Hash Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将后端各类明文密码存储与登录校验渐进式迁移为 bcrypt 哈希，同时保持现网旧账号可平滑登录并自动升级。

**Architecture:** 新增统一密码工具层，所有写入密码的入口统一改为写入 bcrypt 哈希；所有登录入口统一通过密码工具校验，兼容旧明文并在登录成功时原地升级。整个方案不改数据库表结构，以最小迁移风险完成安全升级。

**Tech Stack:** Go, Gin, SQLite, bcrypt

---

### Task 1: 新增统一密码工具层

**Files:**
- Create: `meituanGo/internal/security/password.go`
- Test: `meituanGo/internal/security/password_test.go`

**Step 1: 写失败测试**

覆盖：

- bcrypt 哈希可被识别
- 明文不会被识别为 bcrypt
- bcrypt 校验成功/失败
- 明文兼容校验成功时返回 `needsUpgrade=true`

**Step 2: 运行测试验证失败**

Run: `go test ./internal/security`
Expected: FAIL

**Step 3: 实现最小密码工具**

- `HashPassword`
- `VerifyPassword`
- `LooksLikeBcryptHash`

**Step 4: 再次运行测试**

Run: `go test ./internal/security`
Expected: PASS

### Task 2: 升级主控登录与主控密码写入

**Files:**
- Modify: `meituanGo/internal/handlers/master_auth.go`
- Modify: `meituanGo/internal/handlers/master.go`
- Modify: `meituanGo/internal/db/migrations.go`
- Modify: `meituanGo/internal/handlers/master_auth_test.go`

**Step 1: 写失败测试**

新增测试：

- 明文主控密码登录成功后被升级为哈希
- bcrypt 主控密码可直接登录
- 默认主控种子密码写入为哈希

**Step 2: 运行测试验证失败**

Run: `go test ./internal/handlers -run TestMasterLogin`
Expected: FAIL

**Step 3: 实现最小修改**

- 主控登录切换到密码工具层
- 明文成功登录后自动回写哈希
- 主控改密与种子密码统一写入哈希

**Step 4: 再次运行测试**

Run: `go test ./internal/handlers -run TestMasterLogin`
Expected: PASS

### Task 3: 升级店铺登录与店铺密码写入

**Files:**
- Modify: `meituanGo/internal/handlers/auth.go`
- Modify: `meituanGo/internal/handlers/master_shop_admin.go`
- Test: `meituanGo/internal/handlers/auth_test.go`

**Step 1: 写失败测试**

新增测试：

- 明文店铺密码可登录并升级为哈希
- bcrypt 店铺密码可直接登录
- 主控创建店铺时写入哈希

**Step 2: 运行测试验证失败**

Run: `go test ./internal/handlers -run Test.*Login|Test.*Shop`
Expected: FAIL

**Step 3: 实现最小修改**

- 店铺登录切换到密码工具层
- 创建/更新店铺密码改为写入哈希

**Step 4: 再次运行测试**

Run: `go test ./internal/handlers -run Test.*Login|Test.*Shop`
Expected: PASS

### Task 4: 升级骑手与用户密码逻辑

**Files:**
- Modify: `meituanGo/internal/handlers/mobile.go`
- Test: `meituanGo/internal/handlers/mobile_test.go`

**Step 1: 写失败测试**

新增测试：

- 骑手注册写入哈希
- 明文骑手密码登录成功后自动升级
- 用户注册写入哈希
- 明文用户密码登录成功后自动升级

**Step 2: 运行测试验证失败**

Run: `go test ./internal/handlers -run TestRider|TestUser`
Expected: FAIL

**Step 3: 实现最小修改**

- 骑手注册/登录切换到密码工具层
- 用户注册/历史登录切换到密码工具层

**Step 4: 再次运行测试**

Run: `go test ./internal/handlers -run TestRider|TestUser`
Expected: PASS

### Task 5: 全量验证

**Files:**
- Test: `meituanGo/internal/handlers`
- Test: `meituanGo/internal/security`

**Step 1: 运行后端测试**

Run: `go test ./internal/security ./internal/handlers`
Expected: PASS

**Step 2: 运行前端构建**

Run: `pnpm run build`
Workdir: `meituanAstro`
Expected: PASS

**Step 3: 手工验证关键登录流**

检查：

- 主控登录
- 店铺后台登录
- 骑手登录
- 用户登录
