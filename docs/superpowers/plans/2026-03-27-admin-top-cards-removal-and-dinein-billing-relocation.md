# Admin 顶部状态卡片移除与堂食订阅信息下移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `/admin/[slug]` 顶部 5 个状态卡片及其容器，并把堂食订阅提醒移动到费用 / 续费区域展示。

**Architecture:** 保持现有计费与堂食订阅计算逻辑不变，只调整展示层。顶部 `src/pages/admin/[slug]/index.astro` 去掉五卡片 grid，继续保留 MQTT 状态条和已有告警条；`src/components/admin/TabRenew.astro` 增加一个堂食订阅信息块，承接原顶部卡片展示的堂食订阅字段。

**Tech Stack:** Astro, TypeScript, node:test, admin 页面源码断言测试

---

## File Structure

- `src/pages/admin/[slug]/index.astro`
  - 删除顶部五卡片 grid
  - 保留 MQTT 状态条、余额告警条、佣金待付提醒条
  - 将堂食订阅字段继续传给 `TabRenew`
- `src/components/admin/TabRenew.astro`
  - 新增堂食订阅信息块，接收并展示堂食订阅状态、时间、停用原因、开关状态
- `src/pages/master/dine-in-panel-routing.test.ts`
  - 增加 admin 顶部卡片删除与 `TabRenew` 接通堂食订阅信息的源码断言

### Task 1: 删除 admin 顶部五卡片区

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 追加源码断言，要求 admin 页面源码里不再出现顶部五卡片标题：

```ts
test('admin page source removes top billing and status cards grid', async () => {
  const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
  const adminPage = await readFile(adminPagePath, 'utf8');

  assert.doesNotMatch(adminPage, /钱包余额/);
  assert.doesNotMatch(adminPage, /外卖扣点门槛/);
  assert.doesNotMatch(adminPage, /外卖状态/);
  assert.doesNotMatch(adminPage, /堂食订阅提醒/);
  assert.doesNotMatch(adminPage, /缴费提醒/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: FAIL，因为当前 admin 页面源码里仍然包含这 5 个标题。

- [ ] **Step 3: Write minimal implementation**

删除 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/[slug]/index.astro` 中这整块顶部 grid：

```astro
<div
  style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:8px;"
>
  ...五个卡片...
</div>
```

删除后保留：
- MQTT 状态条
- `billingAlertLevel !== 'normal'` 的提醒条
- `lastMonthCommission > 0` 的提醒条

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，新增删除断言变绿。

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "refactor: remove admin top status cards"
```

### Task 2: 把堂食订阅信息并入 TabRenew

**Files:**
- Modify: `src/pages/admin/[slug]/index.astro`
- Modify: `src/components/admin/TabRenew.astro`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 再追加源码断言，要求 admin 页面把堂食订阅字段传给 `TabRenew`，且 `TabRenew` 渲染堂食订阅标题：

```ts
test('admin renew tab source receives dine-in billing summary', async () => {
  const adminPagePath = resolve(process.cwd(), 'src/pages/admin/[slug]/index.astro');
  const renewPath = resolve(process.cwd(), 'src/components/admin/TabRenew.astro');

  const adminPage = await readFile(adminPagePath, 'utf8');
  const renew = await readFile(renewPath, 'utf8');

  assert.match(adminPage, /dineInBillingStatusLabel=\{dineInBilling\.statusLabel\}/);
  assert.match(adminPage, /dineInBillingStartAt=\{dineInBilling\.billingStartAt\}/);
  assert.match(adminPage, /dineInBillingExpiresAt=\{dineInBilling\.expiresAt\}/);
  assert.match(adminPage, /dineInBillingGraceUntil=\{dineInBilling\.graceUntil\}/);
  assert.match(adminPage, /dineInStopReason=\{dineInStopReason\}/);
  assert.match(adminPage, /dineInToggleLabel=\{dineInToggleLabel\}/);
  assert.match(renew, /堂食订阅/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: FAIL，因为当前 `TabRenew` 还没有接收这些 props，也没有渲染堂食订阅区块。

- [ ] **Step 3: Write minimal implementation**

先在 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabRenew.astro` 顶部 props 解构中追加：

```astro
const {
  ...,
  dineInBillingStatusLabel = '',
  dineInBillingStartAt = '',
  dineInBillingExpiresAt = '',
  dineInBillingGraceUntil = '',
  dineInStopReason = '',
  dineInToggleLabel = '',
} = Astro.props;
```

然后在订阅钱包卡片后、佣金统计卡片前插入最小堂食订阅区块：

```astro
<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:12px; margin-bottom:20px; padding:16px; text-align:left;">
  <h4 style="margin:0 0 10px; color:#9a3412; font-size:14px;">🍽️ 堂食订阅</h4>
  <div style="font-size:13px; color:#7c2d12; font-weight:700; margin-bottom:6px;">{dineInBillingStatusLabel || '--'}</div>
  <div style="font-size:12px; color:#9a3412; margin-top:4px;">计费开始：{dineInBillingStartAt || '--'}</div>
  <div style="font-size:12px; color:#9a3412; margin-top:4px;">到期日期：{dineInBillingExpiresAt || '--'}</div>
  <div style="font-size:12px; color:#b45309; margin-top:4px;">宽限截止：{dineInBillingGraceUntil || '--'}</div>
  <div style="font-size:12px; color:#475569; margin-top:4px;">{dineInStopReason || '--'}</div>
  <div style="font-size:12px; color:#475569; margin-top:4px;">{dineInToggleLabel || '--'}</div>
</div>
```

再在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/[slug]/index.astro` 的 `<TabRenew ... />` 调用处追加：

```astro
        dineInBillingStatusLabel={dineInBilling.statusLabel}
        dineInBillingStartAt={dineInBilling.billingStartAt}
        dineInBillingExpiresAt={dineInBilling.expiresAt}
        dineInBillingGraceUntil={dineInBilling.graceUntil}
        dineInStopReason={dineInStopReason}
        dineInToggleLabel={dineInToggleLabel}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，新增 `TabRenew` 接线与堂食订阅断言变绿。

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/TabRenew.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "refactor: move dine-in billing into renew tab"
```

### Task 3: 全量验证

**Files:**
- Test: `src/pages/master/dine-in-panel-routing.test.ts`
- Test: `src/lib/admin-dashboard-utils.test.ts`

- [ ] **Step 1: Run targeted admin regression**

Run:
```bash
node --test "src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，0 fail。

- [ ] **Step 2: Run related regression**

Run:
```bash
node --test "src/lib/admin-dashboard-utils.test.ts"
```
Expected: PASS，0 fail。

- [ ] **Step 3: Manual verification checklist**

在浏览器手动验证：

```text
1. 打开 http://localhost:3000/admin/102
2. 确认顶部 5 个框全部消失
3. 确认顶部不再残留五宫格容器空白
4. 确认 MQTT 状态条仍在
5. 确认余额/欠费提醒条仍正常显示
6. 切到“费用管理 / Fee Management”
7. 确认里面出现“堂食订阅”信息块
8. 确认状态、计费开始、到期日期、宽限截止、停用原因、堂食开关都还在
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/[slug]/index.astro src/components/admin/TabRenew.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "refactor: simplify admin billing header"
```
