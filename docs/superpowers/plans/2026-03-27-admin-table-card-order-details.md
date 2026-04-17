# Admin 桌卡订单详情入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/admin/[slug]` 的堂食桌卡标题区增加一个不增行的小详情入口，点击后打开现有订单详情弹窗，并显示当前桌订单备注。

**Architecture:** 保持现有 4 个底部主按钮不变，只在桌号右侧增加一个轻量详情图标。复用现有 `details-modal` 与 `table-management.ts` 的详情展示链路，只补齐“打开入口”和“备注渲染”这两个缺口，避免再造一套详情 UI。

**Tech Stack:** Astro, TypeScript, node:test, 现有 admin modal / click delegation 机制

---

## File Structure

- `src/components/admin/TabTables.astro`
  - 在桌卡标题区为有订单的桌卡增加小详情图标按钮，不新增第二排按钮
- `src/scripts/admin/table-management.ts`
  - 暴露一个打开桌位订单详情弹窗的处理函数
  - 在详情弹窗中渲染备注区块
- `src/scripts/admin/click-delegation.ts`
  - 接入新的 `data-admin-action`，把详情按钮路由到 `table-management.ts`
- `src/components/admin/AdminModals.astro`
  - 复用已有 `details-modal`，不新增第二套弹窗结构
- `src/pages/master/dine-in-panel-routing.test.ts`
  - 参考当前页面级源码断言风格，为桌卡详情按钮和现有弹窗挂接增加回归测试

### Task 1: 在桌卡标题区增加详情入口

**Files:**
- Modify: `src/components/admin/TabTables.astro`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 追加一个源码断言，先要求桌卡标题区存在详情按钮且使用新的 action 名称：

```ts
test('admin tables card exposes details trigger in card header', async () => {
  const file = await readFile(new URL('./index.astro', import.meta.url), 'utf8');
  assert.match(file, /data-admin-action="table-details"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: FAIL，因为当前还没有 `data-admin-action="table-details"`

- [ ] **Step 3: Write minimal implementation**

修改 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabTables.astro`，只在 `card.hasOrder` 时于桌号右侧加一个小图标按钮，不改底部 4 个按钮：

```astro
<div class="table-title" style="display:flex; align-items:center; gap:6px;">
  <span>{formatTableTitle(card)}</span>
  {card.hasOrder && (
    <button
      type="button"
      class="btn-action"
      data-admin-action="table-details"
      data-table={card.tableNum}
      title="订单详情"
      style="height:22px; width:22px; font-size:12px;"
    >📋</button>
  )}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，且现有 related tests 仍为绿色

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabTables.astro src/pages/master/dine-in-panel-routing.test.ts
git commit -m "feat: add admin table details trigger"
```

### Task 2: 接通详情按钮到现有弹窗

**Files:**
- Modify: `src/scripts/admin/table-management.ts`
- Modify: `src/scripts/admin/click-delegation.ts`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 再追加源码断言，要求 click delegation 与 table-management 都接入新 action：

```ts
test('admin table details action is wired through click delegation', async () => {
  const delegation = await readFile(new URL('../../scripts/admin/click-delegation.ts', import.meta.url), 'utf8');
  const tableManagement = await readFile(new URL('../../scripts/admin/table-management.ts', import.meta.url), 'utf8');

  assert.match(delegation, /table-details/);
  assert.match(tableManagement, /handleTableDetails/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: FAIL，因为 `table-details` 和 `handleTableDetails` 目前还不存在

- [ ] **Step 3: Write minimal implementation**

在 `D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/table-management.ts` 增加一个最小入口函数，复用现有 `getOrdersForTable()` 与 `showDetailsModal()`：

```ts
export function handleTableDetails(tableNum: string) {
  currentTableNum = tableNum;
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    showAdminToast('该桌号没有活跃订单');
    return;
  }

  showDetailsModal(tableNum, orders);
}
```

并在文件底部注册：

```ts
registerAdminGlobal('handleTableDetails', handleTableDetails);
```

在 `D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/click-delegation.ts` 的 action 分发里补一条：

```ts
else if (action === 'table-details') handleTableDetailsUI(target);
```

同时按当前文件风格补对应 helper，例如：

```ts
function handleTableDetailsUI(target: HTMLElement) {
  const tableNum = String(target.getAttribute('data-table') || '').trim();
  if (!tableNum) return;
  const handler = getAdminHandler<(tableNum: string) => void>('handleTableDetails');
  if (typeof handler === 'function') handler(tableNum);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/admin/table-management.ts src/scripts/admin/click-delegation.ts src/pages/master/dine-in-panel-routing.test.ts
git commit -m "feat: wire admin table details modal"
```

### Task 3: 在详情弹窗里显示备注

**Files:**
- Modify: `src/scripts/admin/table-management.ts`
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts` 追加断言，要求详情弹窗代码里渲染备注文案：

```ts
test('admin table details modal renders order remarks', async () => {
  const tableManagement = await readFile(new URL('../../scripts/admin/table-management.ts', import.meta.url), 'utf8');
  assert.match(tableManagement, /备注/);
  assert.match(tableManagement, /order\.remarks/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: FAIL，因为当前 `showDetailsModal()` 只显示菜品和金额，没有备注区块

- [ ] **Step 3: Write minimal implementation**

在 `D:/ai/food/.worktrees/260311/food2astro/src/scripts/admin/table-management.ts` 的 `showDetailsModal()` 里，在金额上方插入备注区块，只在有备注时渲染：

```ts
const remarks = Array.isArray(order.remarks) ? order.remarks.filter(Boolean) : [];
const remarksSection = remarks.length
  ? (() => {
      const wrap = document.createElement('div');
      setElementStyles(wrap, {
        marginTop: '10px',
        marginBottom: '10px',
        padding: '10px',
        background: '#fff7ed',
        border: '1px solid #fed7aa',
        borderRadius: '6px',
      });
      wrap.append(
        createTextElement('div', '备注', {
          fontWeight: 'bold',
          color: '#9a3412',
          marginBottom: '6px',
        }),
        createTextElement('div', remarks.join('，'), {
          fontSize: '13px',
          color: '#7c2d12',
        }),
      );
      return wrap;
    })()
  : null;
```

并在组装卡片时：

```ts
if (remarksSection) card.appendChild(remarksSection);
card.append(amount, actions);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/admin/table-management.ts src/pages/master/dine-in-panel-routing.test.ts
git commit -m "feat: show remarks in admin table details"
```

### Task 4: 全量验证

**Files:**
- Test: `src/pages/master/dine-in-panel-routing.test.ts`

- [ ] **Step 1: Run targeted verification**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，0 fail

- [ ] **Step 2: Run related regression test**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/lib/admin-dashboard-utils.test.ts"
```
Expected: PASS，桌位匹配相关回归仍为绿色

- [ ] **Step 3: Manual verification checklist**

在浏览器手动验证：

```text
1. 打开 http://localhost:3000/admin/102
2. 找到有活跃订单的 2号桌
3. 确认底部仍只有：点餐 / 结账 / 修改 / 备注
4. 确认桌号右侧出现小详情图标
5. 点击图标，弹出现有订单详情弹窗
6. 弹窗中能看到菜品、金额、备注
7. 空闲桌卡没有详情图标
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/TabTables.astro src/scripts/admin/table-management.ts src/scripts/admin/click-delegation.ts src/pages/master/dine-in-panel-routing.test.ts
git commit -m "feat: add admin table order details entry"
```
