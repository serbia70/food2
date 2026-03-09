# Master Shop Management First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前 Astro 版 `/master` 从简化概览页升级为以“店铺管理”为核心的主控台，优先恢复旧版 `static/master.html` 中最有价值的店铺管理能力与控制台观感。

**Architecture:** 保留现有 Astro 页面、严格登录态、详情抽屉与 impersonate 链路，在此基础上新增更完整的店铺管理主区。页面采用“头部摘要 + tabs + 店铺管理表格 + 创建店铺入口 + 详情联动”结构，用组件化方式重建旧版功能，而不是把旧 HTML 原样搬回。

**Tech Stack:** Astro, TypeScript, Astro components, existing `/api/master/init` data source

---

### Task 1: 定义店铺管理页的数据视图模型

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopSummaryList.astro`
- Create: `meituanAstro/src/lib/master-shop-view.ts`
- Test: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

为店铺列表派生逻辑写最小测试，覆盖：
- 账单状态标签映射
- 到期/警告/严重状态计算
- 余额、营业额、提成数值格式输入归一

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，因为 view model helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-shop-view.ts`：
- `buildMasterShopView(shop)`
- 输出表格显示需要的字段：
  - 名称
  - slug
  - status label
  - billing label
  - expiry label
  - 今日订单/营业额
  - 余额
  - 提成

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 2: 重做 `/master` 的页面骨架与 tab 结构

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Introduce tabs**

把当前页面重构为至少两个 tab：
- `店铺管理`（默认）
- `经营总览`

**Step 2: Preserve strict auth and actions**

保留现有：
- 严格登录跳转
- 登录/重新登录
- 退出
- 刷新

**Step 3: Add control-panel layout**

实现更接近旧版 `master.html` 的主控台骨架：
- 控制台头部
- tab 条
- 内容卡片容器

要求：
- 不要做花哨 dashboard
- 走高密度、表格优先、后台运营面板风格

---

### Task 3: 用表格替换当前店铺列表

**Files:**
- Create: `meituanAstro/src/components/master/MasterShopManagementTable.astro`
- Create: `meituanAstro/src/components/master/MasterShopRowActions.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Build table component**

表格列优先包含：
- 店铺名
- slug
- 运营状态
- 到期状态
- 账单状态/余额
- 今日订单
- 今日营业额
- 提成（月/累计）
- 操作

**Step 2: Add row styling system**

参考旧版 `master.html`：
- 过期行
- 即将到期行
- 账单 warning / critical / overdue

要求：
- 用 Astro 组件和 class 体系实现
- 不把所有样式继续塞回一个大页面文件

**Step 3: Add row actions**

操作按钮至少包括：
- 查看详情
- 进入后台
- 复制前台链接
- 复制后台链接

其中：
- 查看详情复用现有 detail panel
- 进入后台复用现有 impersonate 逻辑

---

### Task 4: 加入“创建店铺”入口卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterCreateShopCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render create-shop card**

在店铺管理 tab 顶部增加创建店铺卡片，参考旧版 `create-box`：
- 店铺名称
- slug
- 初始密码
- 创建按钮

**Step 2: Define first-wave scope clearly**

如果当前后端 `MasterManage` 接口已支持创建店铺，则接入真实提交；
如果还不完整，则先把 UI 和提交入口接好，并在失败时清晰提示。

**Step 3: Keep YAGNI**

第一波不做复杂多字段建店表单，只保留最关键创建字段。

---

### Task 5: 优化视觉层级与控制台质感

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/*.astro`

**Step 1: Establish clear visual system**

定义统一视觉 token：
- page background
- card border/shadow
- status badge colors
- table header / row hover / selected state

**Step 2: Match “control panel” feel**

目标是：
- 比当前版本更强结构
- 比旧版更干净
- 保留后台工具感，不做营销风格视觉

**Step 3: Ensure mobile fallback**

移动端至少做到：
- 表格可横向滚动
- 操作按钮不溢出
- 卡片和 tabs 能正常显示

---

### Task 6: 联通详情与进入后台操作

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopDetailPanel.astro`

**Step 1: Verify detail action from table**

表格行点击“查看详情”后：
- detail panel 打开
- 内容与当前实现保持一致

**Step 2: Verify impersonate action from table**

点击“进入后台”后：
- 调 `/api/master/impersonate-shop`
- 成功跳转 `/admin/{slug}`

**Step 3: Add user-friendly errors**

错误提示要明确，不只显示 generic fail：
- 详情加载失败
- 进入店铺后台失败
- 复制链接失败

---

### Task 7: 验证与收尾

**Files:**
- Modify: `docs/plans/2026-03-06-master-shop-management-first.md`

**Step 1: Run unit tests**

Run: `node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual browser verification**

验证：
- `/master` 默认进入店铺管理视图
- 表格可见且信息完整
- 查看详情可用
- 进入后台可用
- 复制前台/后台链接可用
- 创建店铺卡片可见

**Step 4: Record remaining gaps**

把这一波未做内容记录在文档末尾，例如：
- 全局设置 tab
- 更完整批量编辑
- 更复杂的 master 运维工具区
