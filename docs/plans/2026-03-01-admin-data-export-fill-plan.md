# Admin Data Export Fill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 导出菜单时同步把 JSON 写入导入文本框。

**Architecture:** 在 `exportData()` 生成 payload 后写入 `#import-area`，并保持下载流程不变。

**Tech Stack:** TypeScript, DOM

---

### Task 1: 导出时写入导入文本框

**Files:**
- Modify: `meituanAstro/src/scripts/admin/data.ts`

**Step 1: 写失败测试（如有前端测试框架）**

```ts
// 目标：exportData 执行后，#import-area.value 包含 JSON
```

**Step 2: 运行测试确认失败（如有）**

Run: `npm test`
Expected: FAIL

**Step 3: 实现最小改动**

```ts
const area = document.getElementById('import-area') as HTMLTextAreaElement | null;
if (area) area.value = JSON.stringify(payload, null, 2);
```

**Step 4: 运行测试确认通过（如有）**

Run: `npm test`
Expected: PASS

**Step 5: 提交**

```bash
```

### Task 2: 手动验证（无自动化测试时）

**Files:**
- Verify: `meituanAstro/src/scripts/admin/data.ts`

**Step 1: 运行开发环境**

Run: `npm run dev`

**Step 2: 手动验证**

```text
1) 打开 /admin/{slug}
2) 点击“导出菜单”
3) 文本框自动填充 JSON，且仍会下载文件
```

**Step 3: 记录验证结果**

```text
记录文本框是否正确填充
```
