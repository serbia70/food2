# Master Shop Management Wave 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 继续增强 Astro 版 `/master` 的店铺管理主区，补齐筛选、排序、更多行内操作和更接近旧版控制台的表格交互能力。

**Architecture:** 在第一波“店铺管理优先”表格基础上继续迭代，不推翻现有组件结构。通过扩展 `master-shop-view` 派生字段、增加表格工具栏、行内快捷操作和更细的状态列，让 `/master` 真正具备运营中台的日常使用效率，同时保持当前严格登录态、详情抽屉和 impersonate 链路不变。

**Tech Stack:** Astro, TypeScript, Astro components, existing `/api/master/init` and current master interactions

---

### Task 1: 扩展店铺视图模型以支持筛选与排序

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加测试，覆盖：
- 是否可导出 `billingSeverity` / `expirySeverity`
- 是否提供适合排序的数值字段
- 是否可判断“外卖锁定 / 预警 / 过期”等状态

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，因为新字段还不存在。

**Step 3: Write minimal implementation**

在 `master-shop-view.ts` 增加：
- `billingSeverity`
- `expirySeverity`
- `isDeliveryLocked`
- `sortValueRevenue`
- `sortValueOrders`
- `sortValueBalance`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 2: 为店铺管理表格增加工具栏

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add toolbar UI**

表格顶部增加工具栏，至少包含：
- 搜索框（按店铺名 / slug）
- 状态筛选（全部 / 营业中 / 已停用）
- 账单筛选（全部 / 正常 / 预警 / 逾期）
- 排序方式（营业额 / 今日订单 / 余额）

**Step 2: Implement client-side filtering**

当前先基于 SSR 下发的 `shops` 数据在客户端做过滤与排序，不新增后端接口。

**Step 3: Keep graceful fallback**

如果 JS 不工作，仍然能看到完整原始表格，不让页面空白。

---

### Task 3: 增强表格列与运营标签

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Add richer columns**

在第一波基础上补充更贴近旧版的信息：
- 外卖锁定状态
- 平均客单价
- billing alert 标识
- 行级高亮更细分

**Step 2: Add denser status badges**

参考旧版 `master.html` 的 badge 感：
- 账单预警
- 逾期
- 即将到期
- 正常

**Step 3: Preserve readability**

不要把信息堆得不可读；保持每列职责明确，必要时拆成主行文字 + 次级辅助文字。

---

### Task 4: 增加更多行内快捷操作

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add quick actions**

在现有基础上增加至少一个额外高价值操作，例如：
- 打开前台新窗口
- 打开后台新窗口
- 快速复制 slug

**Step 2: Make feedback explicit**

复制、跳转、失败提示都要明确，不用静默失败。

**Step 3: Keep action density under control**

如果按钮过多，拆成主按钮 + 次级按钮，不要让每行变成按钮墙。

---

### Task 5: 打磨控制台视觉与交互细节

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Modify: `meituanAstro/src/components/master/MasterCreateShopCard.astro`

**Step 1: Refine table interaction states**

补充：
- hover
- active tab feedback
- toolbar spacing
- empty state styling

**Step 2: Improve desktop density**

让页面更像运营后台：
- 减少无效留白
- 提升首屏信息量
- 让表格成为视觉主角

**Step 3: Maintain mobile fallback**

继续保证：
- 表格横向滚动可用
- 工具栏可换行
- 创建店铺区不溢出

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-shop-management-wave-2.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 表格筛选可用
- 排序可用
- 详情、后台、复制链接仍可用
- 创建店铺卡片仍可提交

**Step 4: Record remaining gaps**

记录第三波可能内容：
- 全局设置 tab
- 批量编辑
- 更多运营报表模块
