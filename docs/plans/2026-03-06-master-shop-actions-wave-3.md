# Master Shop Actions Wave 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Astro 版 `/master` 补齐高频行内运营动作，优先实现“编辑店铺”和“充值/余额调整”，让主控台真正具备日常运维能力。

**Architecture:** 在现有店铺管理表格和详情抽屉基础上继续增强，不推翻现有结构。通过新增两个可复用的右侧面板（编辑店铺、充值）和对应表格行操作，把旧版 `master.html` 中高频运营动作以 Astro 组件方式落地，并继续复用 `/api/master/manage` 作为统一提交入口。

**Tech Stack:** Astro, TypeScript, Astro components, current `/api/master/manage` proxy

---

### Task 1: 为店铺操作面板准备视图数据

**Files:**
- Modify: `meituanAstro/src/lib/master-shop-view.ts`
- Modify: `meituanAstro/src/lib/master-shop-view.test.ts`

**Step 1: Write the failing test**

增加测试，确保店铺视图模型包含编辑/充值操作所需字段，例如：
- `id`
- `name`
- `slug`
- `status`
- `billingPlanType`
- `balanceRsd`

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: FAIL，如果这些字段尚未完整导出。

**Step 3: Write minimal implementation**

补齐 `master-shop-view.ts` 导出字段，让前端面板不需要再直接依赖原始散乱对象。

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-shop-view.test.ts`
Expected: PASS

---

### Task 2: 调整表格操作区

**Files:**
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Update actions**

每行操作调整为优先保留：
- `详情`
- `编辑`
- `充值`
- `后台`
- `打开前台`

删除：
- `复制前台链接`

**Step 2: Add data hooks**

为 `编辑` 和 `充值` 按钮增加明确属性：
- `data-open-shop-edit`
- `data-open-shop-topup`

---

### Task 3: 新增“编辑店铺”右侧面板

**Files:**
- Create: `meituanAstro/src/components/master/MasterShopEditPanel.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Build panel shell**

实现右侧抽屉，风格与现有 `MasterShopDetailPanel.astro` 一致。

**Step 2: Add first-wave fields**

编辑店铺第一波优先字段：
- 店铺名称
- slug
- 登录密码
- 套餐类型
- 提成类型
- 提成数值
- 状态

**Step 3: Fill from selected shop**

点击表格“编辑”时，把当前行店铺信息填入面板。

**Step 4: Save via manage API**

提交格式优先：
```json
{
  "action": "update_shop",
  "payload": {
    "id": 1,
    "name": "Shop 02",
    "slug": "02",
    "password": "...",
    "billingPlanType": "subscription",
    "commissionType": "percentage",
    "commissionValue": 3,
    "status": "active"
  }
}
```

---

### Task 4: 新增“充值 / 余额调整”右侧面板

**Files:**
- Create: `meituanAstro/src/components/master/MasterShopTopupPanel.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Build panel shell**

实现与详情/编辑一致的右侧抽屉样式。

**Step 2: Add first-wave fields**

充值面板优先字段：
- 店铺名（只读）
- 当前余额（只读）
- 充值金额
- 备注

**Step 3: Submit via manage API**

提交格式优先：
```json
{
  "action": "topup_shop_balance",
  "payload": {
    "id": 1,
    "amountRsd": 5000,
    "note": "手动充值"
  }
}
```

**Step 4: Refresh UX**

提交成功后：
- 给明确成功提示
- 建议刷新当前页面或局部更新当前行余额

---

### Task 5: 接入前端打开、关闭、提交逻辑

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add panel open/close handlers**

增加：
- 打开编辑面板
- 打开充值面板
- 关闭面板

**Step 2: Keep existing detail logic intact**

不要破坏现有：
- 详情抽屉
- impersonate
- 打开前台

**Step 3: Add explicit feedback**

编辑与充值都要有：
- 加载中 / 提交中
- 成功
- 失败

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-shop-actions-wave-3.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-active-tab.test.ts src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 点击 `编辑` 可打开面板
- 点击 `充值` 可打开面板
- 提交有明确反馈
- 其他操作不受影响

**Step 4: Record backend gaps**

如果 `MasterManage` 还不支持对应 action，记录下来作为下一步 Go 后端补齐任务。
