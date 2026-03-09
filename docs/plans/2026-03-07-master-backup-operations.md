# Master Backup Operations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Astro 版 `/master` 的 `全局设置` tab 补齐数据备份与还原、代码版本备份管理操作。

**Architecture:** 保持现有 `settings-grid` 卡片结构，在当前备份配置卡片旁新增两个独立组件：一个处理系统数据备份和 zip 还原，一个处理代码版本备份的创建、列表和删除。前端优先复用已经存在的 Astro API 代理 `/api/master/backup`、`/api/master/restore` 和 `/api/master/manage`，避免新增后端协议。

**Tech Stack:** Astro, TypeScript, browser form handlers, existing `/api/master/backup`, `/api/master/restore`, existing `/api/master/manage`

---

### Task 1: 为备份操作补最小前端行为测试或 helper 测试

**Files:**
- Create: `meituanAstro/src/lib/master-backup-actions.ts`
- Create: `meituanAstro/src/lib/master-backup-actions.test.ts`

**Step 1: Write the failing test**

为新增 helper 写最小测试，覆盖：
- 代码备份列表数据是否能规范化为空数组
- 代码备份返回项是否能提取 `name/displayName/created`
- 还原文件校验是否拒绝空文件名

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-backup-actions.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

在 `master-backup-actions.ts` 中实现最小 helper，例如：
- `normalizeCodeBackups(input)`
- `validateRestoreFilename(name)`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-backup-actions.test.ts`
Expected: PASS

---

### Task 2: 新增数据备份与还原卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterDataBackupCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render backup/restore card**

卡片至少包含：
- 立即备份按钮
- 还原文件选择
- 还原按钮
- 危险提示文案
- 独立反馈区

**Step 2: Add backup action**

点击“立即备份”时调用：

```json
{
  "action": "trigger_backup",
  "payload": {}
}
```

通过 `/api/master/manage` 提交。

**Step 3: Add restore action**

还原时：
- 校验文件已选择
- 弹出二次确认
- 提交到 `/api/master/restore`

**Step 4: Handle success and failure explicitly**

要求：
- 成功显示 message
- 失败显示 error
- 成功还原后刷新页面

---

### Task 3: 新增代码版本备份卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterCodeBackupCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/lib/master-backup-actions.ts`

**Step 1: Render code backup card**

卡片至少包含：
- 备份名称输入框
- 创建备份按钮
- 列表容器
- 反馈区

**Step 2: Load backup list**

页面加载后调用 `/api/master/backup`：

```json
{
  "action": "list"
}
```

并把结果渲染到列表容器。

**Step 3: Create backup**

点击创建时调用：

```json
{
  "action": "create",
  "backupName": "..."
}
```

成功后刷新列表。

**Step 4: Delete backup**

点击删除时：
- 二次确认
- 提交：

```json
{
  "action": "delete",
  "backupName": "..."
}
```

成功后刷新列表。

---

### Task 4: 将两张卡片接入 settings 页面并完成初始化

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Import new cards**

引入：
- `MasterDataBackupCard`
- `MasterCodeBackupCard`

**Step 2: Place cards into settings grid**

建议顺序：
- `MasterBackupSettingsCard`
- `MasterDataBackupCard`
- `MasterCodeBackupCard`

**Step 3: Initialize code backup list on page load**

在 `DOMContentLoaded` 时调用代码备份列表加载函数。

---

### Task 5: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-backup-operations.md`

**Step 1: Run unit tests**

Run: `node --test src/lib/master-backup-actions.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS

**Step 2: Run related tests**

Run: `node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-backup-actions.test.ts`
Expected: PASS

**Step 3: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 4: Manual verification**

Run: `pnpm run dev`

验证：
- `/master?tab=settings` 能看到两张新卡片
- 立即备份按钮有反馈
- 还原未选文件时会阻止提交
- 代码备份列表能加载
- 创建代码备份后列表刷新
- 删除代码备份后列表刷新

**Step 5: Record remaining gaps**

记录后续候选项：
- 代码备份恢复
- 备份下载真实文件流
- 更细的操作日志与审计

---

## Implementation Record

### 实际执行说明

- 目标项目按用户要求落在 `D:\ai\meituan\.worktrees\260306`
- 当前仓库的 `/master` 已经是 Astro 组件化页面，而不是简单代理页，因此本次最终实现直接接入了 `meituanAstro/src/pages/master/index.astro`
- 保持了现有 `settings-grid` 卡片结构，在原有 `MasterBackupSettingsCard` 后新增了两个独立卡片：
  - `MasterDataBackupCard.astro`
  - `MasterCodeBackupCard.astro`

### 已完成项

- 已新增 helper：`meituanAstro/src/lib/master-backup-actions.ts`
- 已新增测试：`meituanAstro/src/lib/master-backup-actions.test.ts`
- 已接入数据备份与 zip 还原卡片
- 已接入代码版本备份卡片
- 已在 `DOMContentLoaded` 时自动加载代码备份列表
- 已为备份、还原、列表加载、创建、删除补充独立反馈区

### 验证记录

#### 1. Unit tests

Run:

```bash
node --test src/lib/master-backup-actions.test.ts src/lib/master-settings-view.test.ts
```

Result: PASS（6/6）

#### 2. Related tests

Run:

```bash
node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-backup-actions.test.ts
```

Result: PASS（20/20）

#### 3. Build frontend

Run:

```bash
pnpm build
```

Result: PASS

Note:

- 构建期间存在一个既有 Vite warning：`table-actions.ts` 同时被动态和静态导入，但不影响本次构建成功

### 手动验证项

以下项已具备可验证实现，建议在本地运行 `pnpm run dev` 后核对：

- `/master?tab=settings` 可看到 `备份设置`、`数据备份与还原`、`代码版本备份` 三张相邻卡片
- 点击“立即备份”后，卡片反馈区会显示执行状态与结果
- 未选择 zip 文件时，点击“开始还原”会阻止提交并显示错误反馈
- 页面加载后会自动请求代码备份列表
- 创建代码备份成功后会自动刷新列表
- 删除代码备份成功后会自动刷新列表

### Remaining Gaps

- 代码备份恢复能力尚未纳入本次范围
- 数据备份当前反馈为任务触发结果，未实现真实文件流下载
- 备份与还原操作尚未补充更细粒度日志、审计记录与操作者追踪
