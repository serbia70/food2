# Admin Stats Bilingual Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在商家后台统计页提供中文/塞尔维亚语双语文案，并默认展示当天数据（自动设定日期并查询）。

**Architecture:** 前端在统计页组件中注入双语文案与默认日期逻辑；统计脚本在页面加载时设置日期并触发查询，同时根据后端响应渲染双语提示与表格。

**Tech Stack:** Astro, TypeScript, 原生 DOM 操作

---

### Task 1: 统计脚本增加默认今天与双语提示

**Files:**
- Modify: `meituanAstro/src/scripts/admin/stats.ts`

**Step 1: 写失败测试（如有前端测试框架）**

```ts
// 若项目已有前端测试框架：新增测试验证
// 1) DOMContentLoaded 会设置日期为今天
// 2) loadStats 未选日期时弹双语提示
// 3) 空数据时表格显示双语提示
```

**Step 2: 运行测试确认失败（如有）**

Run: `npm test`
Expected: FAIL（新增测试失败或无测试环境）

**Step 3: 实现最小改动**

```ts
// 关键点：
// - DOMContentLoaded 设置 #stats-start/#stats-end 为今天
// - 自动调用 loadStats()
// - 未选日期提示“请选择日期范围 / Izaberite opseg datuma”
// - 查询失败提示“查询失败 / Neuspešan upit”
// - 空数据提示“暂无数据 / Nema podataka”
```

**Step 4: 运行测试确认通过（如有）**

Run: `npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add meituanAstro/src/scripts/admin/stats.ts
git commit -m "feat: add bilingual stats copy and default today"
```

### Task 2: 统计页文案改为双语

**Files:**
- Modify: `meituanAstro/src/components/admin/TabStats.astro`

**Step 1: 写失败测试（如有前端测试框架）**

```ts
// 验证统计页文案包含中文/塞尔维亚语双语格式
```

**Step 2: 运行测试确认失败（如有）**

Run: `npm test`
Expected: FAIL

**Step 3: 实现最小改动**

```astro
<!-- 将标题、筛选项、统计卡片、表头、空数据文案改为双语：中文 / Српски -->
```

**Step 4: 运行测试确认通过（如有）**

Run: `npm test`
Expected: PASS

**Step 5: 提交**

```bash
git add meituanAstro/src/components/admin/TabStats.astro
git commit -m "feat: localize admin stats labels to bilingual"
```

### Task 3: 手动验证（无自动化测试时）

**Files:**
- Verify: `meituanAstro/src/components/admin/TabStats.astro`
- Verify: `meituanAstro/src/scripts/admin/stats.ts`

**Step 1: 运行开发环境**

Run: `npm run dev`

**Step 2: 手动验证**

```text
1) 打开 admin 统计页
2) 页面加载后日期默认今天，自动显示统计数据
3) 文案为“中文 / Српски”双语
4) 清空日期并查询，提示双语错误
```

**Step 3: 记录验证结果**

```text
在任务完成说明中记录验证结果与页面表现
```
