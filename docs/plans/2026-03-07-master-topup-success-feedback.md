# Master Topup Success Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让主控台充值成功后自动关闭抽屉、局部更新当前店铺余额，并显示明确成功提示，避免用户误以为充值未生效。

**Architecture:** 使用显式接口 `POST /api/master/shop-balance` 返回的 `billing` 数据在前端局部更新。前端新增一个轻量的页面级提示条（toast/notice），充值成功后关闭右侧充值抽屉，并把对应表格行余额字段更新为最新值，保持其他功能不受影响。

**Tech Stack:** Astro, TypeScript, existing `/api/master/manage` response

---

### Task 1: 为充值成功反馈写前端状态辅助函数测试

**Files:**
- Create: `meituanAstro/src/lib/master-billing-state.ts`
- Create: `meituanAstro/src/lib/master-billing-state.test.ts`

**Step 1: Write the failing test**

写最小测试，覆盖：
- 根据 `shop_id` 更新对应店铺的 `balanceRsd`
- 其他店铺不变
- 缺失目标店铺时返回原列表

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/master-billing-state.test.ts`
Expected: FAIL，因为 helper 尚不存在。

**Step 3: Write minimal implementation**

新增 `master-billing-state.ts`：
- `applyTopupResultToShopViews(shops, billing)`

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/master-billing-state.test.ts`
Expected: PASS

---

### Task 2: 增加主控台轻量成功提示区

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Add notice container**

在页面主区顶部加入一个隐藏的成功提示区，用于显示：
- `充值成功，余额已更新`

**Step 2: Add helper**

在 inline script 中新增：
- `showMasterFlash(message, type)`

要求：
- 默认隐藏
- 成功后显示
- 数秒后可自动淡出或保留直到下一次操作

---

### Task 3: 充值成功后自动关闭抽屉

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Update topup success branch**

在 `handleShopTopup(form)` 中：
- 仅当返回 `success: true` 时执行关闭动作
- 将 `master-shop-topup-panel.hidden = true`

**Step 2: Preserve failure behavior**

失败时：
- 不关闭抽屉
- 保留错误提示

---

### Task 4: 局部更新当前店铺余额

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`
- Modify: `meituanAstro/src/components/master/MasterShopManagementTable.astro`

**Step 1: Add row identifiers**

表格当前行需要可定位：
- 增加 `data-shop-id`
- 余额显示节点增加 `data-shop-balance`

**Step 2: Apply billing result**

充值成功后：
- 用 `billing.shop_id` 找到对应行
- 更新余额显示文本为最新 `billing.balance_rsd`

**Step 3: Keep implementation minimal**

第一波只更新：
- 当前店铺余额

不顺手改一堆别的字段，避免扩大范围。

---

### Task 5: 完成成功态体验

**Files:**
- Modify: `meituanAstro/src/pages/master/index.astro`

**Step 1: Show success feedback**

充值成功后：
- 显示 `充值成功，余额已更新`

**Step 2: Clear form state**

关闭前清空：
- 金额
- 备注

**Step 3: Avoid fake success wording**

把当前成功提示从：
- `充值请求已提交`

改成更准确的：
- `充值成功，余额已更新`

---

### Task 6: 验证与记录

**Files:**
- Modify: `docs/plans/2026-03-07-master-topup-success-feedback.md`

**Step 1: Run tests**

Run: `node --test src/lib/master-active-tab.test.ts src/lib/master-auth.test.ts src/lib/master-shop-view.test.ts src/lib/master-settings-view.test.ts src/lib/master-billing-state.test.ts`
Expected: PASS

**Step 2: Build frontend**

Run: `pnpm build`
Expected: PASS

**Step 3: Manual verification**

验证：
- 点击充值并成功提交后抽屉自动关闭
- 页面出现成功提示
- 对应店铺余额立即更新
