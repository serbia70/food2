# Master Edit Shop Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `/master` 中的“编辑店铺”保存后拥有和充值一致的稳定反馈闭环：明确成功提示、关闭抽屉、刷新页面显示最新数据。

**Architecture:** 不做复杂局部状态同步，沿用充值已经验证可用的“成功后刷新当前页”策略。编辑店铺成功后统一采用：保存成功提示 -> 关闭抽屉 -> 弹出成功提示 -> 刷新 `/master`，保证表格状态、套餐类型、名称等字段由 SSR 最新数据重绘。

**Tech Stack:** Astro, TypeScript, existing `/api/master/manage`, existing edit panel

---

### Task 1: 为编辑成功后的前端反馈写最小测试

**Files:**
- Create: `meituanAstro/src/lib/master-edit-feedback.test.ts`
- Create: `meituanAstro/src/lib/master-edit-feedback.ts`

**Step 1: Write the failing test**

写最小测试，覆盖：
- 成功文案生成
- 未传店铺名时的默认文案

例如：
- `Shop 02 保存成功，页面将刷新以显示最新状态`

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-edit-feedback.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-edit-feedback.ts`，实现：
- `buildEditShopSuccessMessage(shopName)`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-edit-feedback.test.ts`
Expected: PASS

---

### Task 2: 编辑店铺成功后采用稳定闭环

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Update success branch**

在 `handleShopEdit(form)` 成功分支中：
- 关闭编辑抽屉
- 使用明确成功提示
- 刷新页面

**Step 2: Keep failure branch intact**

失败时：
- 保留当前抽屉打开
- 显示错误提示

**Step 3: Match topup UX**

与充值保持一致：
- 成功 -> `alert(...)` + reload

---

### Task 3: 优化编辑成功提示内容

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopEditPanel.astro`

**Step 1: Use shop name in success copy**

成功提示优先显示：
- `已保存 Shop 02，页面将刷新以显示最新状态`

**Step 2: Avoid vague wording**

不要再使用：
- `店铺修改请求已提交`

改成更明确的成功结果语气。

---

### Task 4: 验证表单字段在刷新后正确回显

**Files:**
- Modify: `docs/plans/2026-03-07-master-edit-shop-feedback.md`

**Step 1: Manual verification target**

验证这些字段刷新后能从 SSR 最新数据看到：
- 店铺名称
- 套餐类型
- 状态
- 相关主状态展示

---

### Task 5: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-edit-shop-feedback.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-edit-feedback.test.ts src/lib/master-shop-view.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 打开编辑面板
- 修改店铺名称/状态/套餐
- 保存后抽屉关闭
- 出现成功提示
- 页面刷新后展示已更新
