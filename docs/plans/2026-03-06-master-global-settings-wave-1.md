# Master Global Settings Wave 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Astro 版 `/master` 增加第一波“全局设置”tab，优先支持套餐与提成设置、超级密码修改，让主控台具备基础系统管理能力。

**Architecture:** 在现有 `/master` 多 tab 结构中新增 `全局设置` tab，不回退旧版单文件模式。设置区先拆成两个独立卡片：`套餐与提成设置`、`超级密码修改`，每张卡片独立提交与反馈，尽量复用现有 `/api/master/init` 返回的 `settings` 和 `/api/master/manage` 提交链路。

**Tech Stack:** Astro, TypeScript, Astro components, existing `/api/master/init`, `/api/master/manage`

---

### Task 1: 梳理设置视图模型与默认值

**Files:**
- Create: `meituanAstro/src/lib/master-settings-view.ts`
- Create: `meituanAstro/src/lib/master-settings-view.test.ts`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Write the failing test**

为设置视图模型写测试，覆盖：
- 从 `settings` 提取订阅版 / 商务版月费
- 从 `settings` 提取订阅版 / 商务版提成类型与数值
- 缺失字段时回退默认值

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-settings-view.ts`，实现：
- `buildMasterSettingsView(settings)`
- 输出：
  - `subscriptionFeeRsd`
  - `businessFeeRsd`
  - `subscriptionCommissionType`
  - `subscriptionCommissionValue`
  - `businessCommissionType`
  - `businessCommissionValue`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-settings-view.test.ts`
Expected: PASS

---

### Task 2: 在 `/master` 中增加“全局设置”tab

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add tab button**

在当前 tab 条中新增：
- `全局设置`

**Step 2: Add settings panel container**

在页面中新增 `data-master-panel="settings"` 容器，保持与现有 `management`、`overview` 一致的切换逻辑。

**Step 3: Keep current pages intact**

不要破坏现有：
- 店铺管理 tab
- 经营总览 tab
- 详情抽屉
- impersonate 逻辑

---

### Task 3: 实现“套餐与提成设置”卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterPricingSettingsCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render pricing card**

卡片内包含：
- 订阅版月费
- 商务版月费
- 订阅版提成类型
- 订阅版提成数值
- 商务版提成类型
- 商务版提成数值

**Step 2: Fill from current settings**

表单默认值来自 `buildMasterSettingsView(settings)`。

**Step 3: Add save action**

按钮：`保存套餐与提成设置`

前端提交优先格式：
```json
{
  "action": "update_master_settings",
  "payload": {
    "subscriptionFeeRsd": 1200,
    "businessFeeRsd": 1800,
    "subscriptionDeliveryCommissionType": "percentage",
    "subscriptionDeliveryCommissionValue": 3,
    "businessDeliveryCommissionType": "percentage",
    "businessDeliveryCommissionValue": 3
  }
}
```

**Step 4: Fail gracefully if backend shape differs**

如果后端暂未完全兼容当前 action/payload：
- 给清晰错误提示
- 不让页面卡死

---

### Task 4: 实现“超级密码修改”卡片

**Files:**
- Create: `meituanAstro/src/components/master/MasterSecurityCard.astro`
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Render security card**

至少包含：
- 新密码输入框
- 确认密码输入框
- 保存按钮

**Step 2: Add front-end validation**

提交前验证：
- 新密码不能为空
- 两次输入一致

**Step 3: Add save action**

前端提交优先格式：
```json
{
  "newPassword": "new-password"
}
```

路由：`POST /api/master/password`

如果后端实际要求不同，提示明确错误。

---

### Task 5: 增加设置提交与反馈逻辑

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add dedicated submit handlers**

分别处理：
- 套餐与提成设置提交
- 超级密码提交

**Step 2: Provide explicit feedback**

每张卡片都要有：
- 保存中
- 保存成功
- 保存失败

**Step 3: Keep code readable**

避免把大量设置提交逻辑堆在一个匿名函数里；可抽小函数，但不要过度封装。

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-06-master-global-settings-wave-1.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- `/master` 可切换到 `全局设置`
- 表单默认值正常显示
- 点击保存有明确反馈
- 其他 tab 不受影响

**Step 4: Record remaining gaps**

记录下一波设置候选项：
- 页脚信息
- 收款码设置
- 图片存储
- 自动备份
