# Admin Stats Bilingual Item Names Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统计页“菜品销量排名”展示商家实际录入的双语菜名（有 `sub_name` 则显示 `name / sub_name`，否则仅显示 `name`）。

**Architecture:** 后端统计接口按 `product_id` 优先聚合，补齐 `name/sub_name` 并生成 `display_name`；前端渲染优先使用 `display_name`，无则回退 `name`。

**Tech Stack:** Go (Gin), Astro/TypeScript

---

### Task 1: 后端统计接口补充双语菜名

**Files:**
- Modify: `meituanGo/internal/handlers/admin_compat.go`

**Step 1: 写失败测试（如有 Go 测试框架）**

```go
// 目标：AdminStats 返回 topItems[].display_name
// - 当 sub_name 存在：display_name == name + " / " + sub_name
// - 当 sub_name 为空：display_name == name
```

**Step 2: 运行测试确认失败（如有）**

Run: `go test ./...`
Expected: FAIL（新增测试失败或无测试环境）

**Step 3: 实现最小改动**

```go
// 关键点：
// - items_json 提取 product_id 与 name
// - 批量查询 products(id,name,sub_name)
// - topItems 增加 display_name
```

**Step 4: 运行测试确认通过（如有）**

Run: `go test ./...`
Expected: PASS

**Step 5: 提交**

```bash
git add meituanGo/internal/handlers/admin_compat.go
git commit -m "feat: add bilingual product names to admin stats"
```

### Task 2: 前端统计表使用 display_name

**Files:**
- Modify: `meituanAstro/src/scripts/admin/stats.ts`

**Step 1: 写失败测试（如有前端测试框架）**

```ts
// 验证渲染优先使用 display_name，缺失时使用 name
```

**Step 2: 运行测试确认失败（如有）**

Run: `npm test`
Expected: FAIL

**Step 3: 实现最小改动**

```ts
// name = display_name || name
```

**Step 4: 运行测试确认通过（如有）**

Run: `npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add meituanAstro/src/scripts/admin/stats.ts
git commit -m "feat: show bilingual item names in stats table"
```

### Task 3: 手动验证（无自动化测试时）

**Files:**
- Verify: `meituanGo/internal/handlers/admin_compat.go`
- Verify: `meituanAstro/src/scripts/admin/stats.ts`

**Step 1: 运行后端与前端**

Run: `go run ./cmd/server` (或项目现有启动方式)
Run: `npm run dev`

**Step 2: 手动验证**

```text
1) 商品录入 name=塞语, sub_name=中文：统计表显示“塞语 / 中文”
2) 仅录入 name=中文，sub_name 为空：统计表显示中文
```

**Step 3: 记录验证结果**

```text
在任务完成说明中记录验证结果与页面表现
```
