# Master 门店状态红绿按钮与编辑面板精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 master 门店列表的“门店状态”改成堂食 / 预订 / 外卖三项红绿状态按钮，并删除编辑店铺面板里重复的业务开关区，同时保证保存 payload 与堂食订阅入口不被破坏。

**Architecture:** 保持现有 `MasterShopView` 数据结构不变，直接复用 `enableDineIn / enableReservation / enableDelivery` 渲染新的状态按钮 UI。编辑店铺面板删除可见业务开关后，`deliveryEnabled / reservationEnabled` 继续作为预订和外卖的唯一真值，`enableDineIn` 仅以隐藏字段保留给保存链路使用；`master/index.astro` 与 `master-shop-edit-payload.ts` 只做最小回填和派生修正。

**Tech Stack:** Astro、TypeScript、node:test、pnpm

---

## File Structure & Responsibilities

**Reference:** `docs/superpowers/specs/2026-03-24-master-status-badges-and-edit-cleanup-design.md`

**Modify:**
- `src/components/master/MasterShopManagementTable.astro`
  - 把“门店状态”列从汇总文案块改成两行红绿状态按钮。
  - 删除对 `shop.shopStateLabel / shop.shopStateReason` 的表格主展示依赖。
- `src/components/master/MasterShopEditPanel.astro`
  - 删除 `店铺业务开关` 可见区块。
  - 重新排版为“基础信息 + 提成设置”，并保留 `enableDineIn` 隐藏字段。
- `src/pages/master/index.astro`
  - 清理 `openShopEditPanel()` 中对已删除字段的回填。
  - 保留 `enableDineIn` 隐藏字段回填，不再访问 `enableDelivery / enableReservation`。
- `src/lib/master-shop-edit-payload.ts`
  - 当 `enableDelivery / enableReservation` 缺失时，改为从 `deliveryEnabled / reservationEnabled` 派生。
  - 保留 `enableDineIn` 隐藏字段透传。
- `src/pages/master/master-billing-ui.test.ts`
  - 锁定门店状态列的新按钮布局、颜色类与编辑面板的新排版。
  - 锁定页面脚本不再访问已删除字段。
- `src/lib/master-shop-edit-payload.test.ts`
  - 锁定删除可见业务开关后的 payload 映射和堂食隐藏字段透传。

**Reference only:**
- `src/lib/master-shop-view.ts`
  - 本次不改状态建模，只复用现有 `enableDineIn / enableReservation / enableDelivery`。
- `src/components/master/MasterShopDineInPanel.astro`
  - 本次不改堂食订阅面板交互。

**Not touching:**
- `data-master-filter-status` 的筛选逻辑
- `src/lib/master-shop-view.ts` 的 `shopStateLabel / shopStateReason` 生成逻辑
- 堂食订阅 API / 提交流程

---

### Task 1: 把门店状态列改成堂食 / 预订 / 外卖红绿按钮

**Files:**
- Modify: `src/pages/master/master-billing-ui.test.ts`
- Modify: `src/components/master/MasterShopManagementTable.astro`
- Reference: `src/lib/master-shop-view.ts`

- [ ] **Step 1: 先写会失败的表格源码测试**

在 `src/pages/master/master-billing-ui.test.ts` 的 `master management table renders split plan summary` 用例里追加断言：

```ts
assert.match(table, /shop-state-grid/);
assert.match(table, /shop-state-pill/);
assert.match(table, /shop\.enableDineIn \? 'is-on' : 'is-off'/);
assert.match(table, /shop\.enableReservation \? 'is-on' : 'is-off'/);
assert.match(table, /shop\.enableDelivery \? 'is-on' : 'is-off'/);
assert.match(table, />堂食</);
assert.match(table, />预订</);
assert.match(table, />外卖</);
assert.doesNotMatch(table, /shop\.shopStateLabel/);
assert.doesNotMatch(table, /shop\.shopStateReason/);
```

保留已有的 `shop.reservationPlan` / `shop.deliveryPlan` 摘要断言，不要顺手删掉其它 coverage。

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected:
- FAIL，至少会报缺少 `shop-state-grid` 或仍命中 `shop.shopStateLabel`

- [ ] **Step 3: 写最小实现替换状态列展示**

在 `src/components/master/MasterShopManagementTable.astro` 中，把当前这段：

```astro
<div class="shop-state-cell">
  <span class="badge-status">{shop.shopStateLabel}</span>
  {shop.shopStateReason ? <div class="state-subtext">{shop.shopStateReason}</div> : null}
</div>
```

改成固定两行的展示结构：

```astro
<div class="shop-state-grid" aria-label="门店状态">
  <div class="shop-state-row shop-state-row-single">
    <span class:list={['shop-state-pill', shop.enableDineIn ? 'is-on' : 'is-off']}>堂食</span>
  </div>
  <div class="shop-state-row shop-state-row-double">
    <span class:list={['shop-state-pill', shop.enableReservation ? 'is-on' : 'is-off']}>预订</span>
    <span class:list={['shop-state-pill', shop.enableDelivery ? 'is-on' : 'is-off']}>外卖</span>
  </div>
</div>
```

并补最小样式：

```css
.shop-state-grid { display: grid; gap: 6px; }
.shop-state-row { display: flex; gap: 6px; }
.shop-state-row-single { justify-content: flex-start; }
.shop-state-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 800;
}
.shop-state-pill.is-on { background: #dcfce7; color: #166534; }
.shop-state-pill.is-off { background: #fee2e2; color: #991b1b; }
```

不要改：
- `data-status={shop.statusLabel}`
- 工具栏筛选相关属性
- 提成摘要区

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/master/MasterShopManagementTable.astro src/pages/master/master-billing-ui.test.ts
git commit -m "fix(master): show channel states as colored pills"
```

---

### Task 2: 删除编辑店铺面板里的冗余业务开关并重排版面

**Files:**
- Modify: `src/pages/master/master-billing-ui.test.ts`
- Modify: `src/components/master/MasterShopEditPanel.astro`

- [ ] **Step 1: 先写会失败的编辑面板源码测试**

在 `src/pages/master/master-billing-ui.test.ts` 的 `master shop edit panel exposes split overrides and reset action` 用例里，把上次新增的“店铺业务开关 / 外卖接单 / 预约接单”断言替换成新的断言：

```ts
assert.match(panel, /修改基础信息与预订\s*\/\s*外卖提成/);
assert.match(panel, /基础信息/);
assert.match(panel, /提成设置/);
assert.match(panel, /type="hidden" name="enableDineIn"/);
assert.doesNotMatch(panel, /店铺业务开关/);
assert.doesNotMatch(panel, /外卖接单/);
assert.doesNotMatch(panel, /预约接单/);
assert.doesNotMatch(panel, /name="enableDelivery"/);
assert.doesNotMatch(panel, /name="enableReservation"/);
```

同时保留这些断言：

```ts
assert.match(panel, /name="reservationEnabled"/);
assert.match(panel, /name="deliveryEnabled"/);
assert.match(panel, /name="status"/);
assert.match(panel, /恢复全局默认/);
```

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected:
- FAIL，仍能匹配到 `店铺业务开关` 或 `name="enableDelivery"`

- [ ] **Step 3: 写最小面板改动**

在 `src/components/master/MasterShopEditPanel.astro` 中：

1. 把副标题从：

```astro
<div class="side-subtitle">修改名称、预订 / 外卖提成和状态</div>
```

改成：

```astro
<div class="side-subtitle">修改基础信息与预订 / 外卖提成</div>
```

2. 在基础字段前后加最小分区标题，例如：

```astro
<div class="form-section-title">基础信息</div>
...
<div class="form-section-title">提成设置</div>
```

3. 删除整个 `店铺业务开关` 可见区块。

4. 在表单里保留一个隐藏字段：

```astro
<input type="hidden" name="enableDineIn" />
```

5. 不要删除以下字段：
- `reservationEnabled`
- `reservationCommissionType`
- `reservationCommissionValue`
- `deliveryEnabled`
- `deliveryCommissionType`
- `deliveryCommissionValue`

并补最小样式：

```css
.form-section-title {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 900;
  color: #0f172a;
}
```

不要顺手新增新的交互组件，也不要改保存按钮行为。

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/master/MasterShopEditPanel.astro src/pages/master/master-billing-ui.test.ts
git commit -m "fix(master): remove redundant shop toggle section"
```

---

### Task 3: 修正页面回填与 payload 派生，避免删除字段后误保存

**Files:**
- Modify: `src/lib/master-shop-edit-payload.test.ts`
- Modify: `src/pages/master/master-billing-ui.test.ts`
- Modify: `src/pages/master/index.astro`
- Modify: `src/lib/master-shop-edit-payload.ts`

- [ ] **Step 1: 先写会失败的 payload 与页面源码测试**

先在 `src/lib/master-shop-edit-payload.test.ts` 新增用例：

```ts
test('payload derives delivery and reservation toggles from fee-card enabled fields when business toggles are absent', () => {
  const payload = buildMasterShopEditPayload({
    id: '7',
    name: 'Demo Shop',
    slug: 'demo-shop',
    status: 'active',
    enableDineIn: '0',
    reservationEnabled: '0',
    reservationCommissionType: 'percentage',
    reservationCommissionValue: '0',
    deliveryEnabled: '1',
    deliveryCommissionType: 'per_order',
    deliveryCommissionValue: '5',
  });

  assert.equal(payload.enableReservation, false);
  assert.equal(payload.enableDelivery, true);
  assert.equal(payload.enableDineIn, false);
  assert.equal(payload.subscription_enabled, 0);
  assert.equal(payload.business_enabled, 1);
});
```

再在 `src/pages/master/master-billing-ui.test.ts` 的 page source 用例里增加断言：

```ts
assert.match(page, /form\.elements\.enableDineIn\.value = shop\.enableDineIn \? '1' : '0';/);
assert.doesNotMatch(page, /form\.elements\.enableDelivery\.value = shop\.enableDelivery \? '1' : '0';/);
assert.doesNotMatch(page, /form\.elements\.enableReservation\.value = shop\.enableReservation \? '1' : '0';/);
```

- [ ] **Step 2: 跑测试，确认现在是红的**

Run: `node --test src/lib/master-shop-edit-payload.test.ts src/pages/master/master-billing-ui.test.ts`

Expected:
- FAIL，payload 仍依赖 `enableDelivery / enableReservation`
- FAIL，page source 仍会命中旧的 `form.elements.enableDelivery` / `enableReservation`

- [ ] **Step 3: 写最小实现，固定单一路径**

#### 3a. 先改 `src/pages/master/index.astro`
在 `openShopEditPanel()` 里删除：

```ts
form.elements.enableDelivery.value = shop.enableDelivery ? '1' : '0';
form.elements.enableReservation.value = shop.enableReservation ? '1' : '0';
```

保留：

```ts
form.elements.enableDineIn.value = shop.enableDineIn ? '1' : '0';
```

并继续保留：

```ts
form.elements.reservationEnabled.value = shop.reservationPlan.enabled ? '1' : '0';
form.elements.deliveryEnabled.value = shop.deliveryPlan.enabled ? '1' : '0';
```

#### 3b. 再改 `src/lib/master-shop-edit-payload.ts`
不要继续直接写：

```ts
enableDelivery: toBoolean(input.enableDelivery, true),
enableReservation: toBoolean(input.enableReservation, true),
```

改成“缺失时从提成卡启用字段派生”的固定路径。最小写法：

```ts
const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

const enableDelivery = hasOwn('enableDelivery')
  ? toBoolean(input.enableDelivery, deliveryEnabled)
  : deliveryEnabled;

const enableReservation = hasOwn('enableReservation')
  ? toBoolean(input.enableReservation, reservationEnabled)
  : reservationEnabled;

const enableDineIn = hasOwn('enableDineIn')
  ? toBoolean(input.enableDineIn, true)
  : true;
```

然后 return 时使用：

```ts
enableDelivery,
enableDineIn,
enableReservation,
```

并继续保持：

```ts
reservation_enabled: reservationEnabled ? 1 : 0,
delivery_enabled: deliveryEnabled ? 1 : 0,
subscription_enabled: reservationEnabled ? 1 : 0,
business_enabled: deliveryEnabled ? 1 : 0,
```

不要顺手改：
- 提成默认值逻辑
- `commissionMode` 逻辑
- 堂食订阅面板代码

- [ ] **Step 4: 再跑测试，确认变绿**

Run: `node --test src/lib/master-shop-edit-payload.test.ts src/pages/master/master-billing-ui.test.ts`

Expected: PASS

- [ ] **Step 5: 跑本任务聚焦验证**

Run:
- `node --test src/lib/master-shop-edit-payload.test.ts src/pages/master/master-billing-ui.test.ts`
- `pnpm build`

Expected:
- 两个测试文件 PASS
- `pnpm build` 成功，无新增阻塞错误

- [ ] **Step 6: 提交**

```bash
git add src/lib/master-shop-edit-payload.ts src/lib/master-shop-edit-payload.test.ts src/pages/master/index.astro src/pages/master/master-billing-ui.test.ts
git commit -m "fix(master): derive channel toggles from active editors"
```

---

### Task 4: 做页面级验收，确认用户关心的场景成立

**Files:**
- Reference: `src/components/master/MasterShopManagementTable.astro`
- Reference: `src/components/master/MasterShopEditPanel.astro`
- Reference: `src/components/master/MasterShopDineInPanel.astro`
- Reference: `src/pages/master/index.astro`

- [ ] **Step 1: 验证门店状态列视觉结果**

Manual checklist:
1. 打开 `http://localhost:3000/master?tab=management`
2. 确认“门店状态”列不再出现“正常运营”等汇总文案
3. 确认每行固定显示：
   - 第一行 `堂食`
   - 第二行 `预订`、`外卖`
4. 确认按钮仅显示项目名，没有“开 / 关”文字

- [ ] **Step 2: 验证全关 / 部分关闭 / 全开三种状态**

Manual checklist:
1. 若 101 店铺三项都关，确认三颗按钮全红
2. 若只关 1 项或 2 项，确认是红绿混合，不再出现“关一显示关”这种汇总判断
3. 若三项都开，确认三颗按钮全绿

- [ ] **Step 3: 验证编辑店铺面板整理结果**

Manual checklist:
1. 打开“编辑店铺”面板
2. 确认不再有 `店铺业务开关`
3. 确认副标题是“基础信息 + 提成”导向文案
4. 确认仍可编辑：
   - 店铺名称
   - slug
   - 登录密码
   - 店铺总状态
   - 预订提成卡
   - 外卖提成卡

- [ ] **Step 4: 验证状态修改入口仍然可用**

Manual checklist:
1. 在“编辑店铺”里切换 `预订` / `外卖` 提成卡的 `启用` 值并保存
2. 返回列表，确认对应 `预订` / `外卖` 状态按钮随之变化
3. 打开“堂食订阅”面板修改堂食开关
4. 返回列表，确认 `堂食` 状态按钮随之变化

---

## Notes for the implementer

- 本次不要改 `data-master-filter-status` 工具栏筛选。
- 本次不要重写 `master-shop-view.ts` 的汇总状态算法。
- 本次不要给门店状态按钮加点击能力。
- `enableDineIn` 必须继续保留到保存链路里；如果这里丢了，保存一次店铺就可能把堂食错误恢复为开启。
- `enableDelivery / enableReservation` 的真值只能来自 `deliveryEnabled / reservationEnabled`，不要再保留第二套隐藏字段。
- 不要创建空提交；如果某一步没有新改动，就继续下一步，不额外 commit。
