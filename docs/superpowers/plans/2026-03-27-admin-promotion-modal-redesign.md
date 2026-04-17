# Admin 促销弹窗重设计 Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 admin 促销弹窗重设计时的实施步骤，文中的 `历史红灯预期：` 属于当时的阶段性红灯预期，不应再直接当作当前实现状态。
> 若继续处理促销弹窗、搜索区或双语菜品渲染，请先以当前 `TabMarketing.astro` 与现有测试为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做 `/admin/[slug]` 营销页的促销弹窗，让“今日特价”在桌面端更宽、更易选、更易搜，并保持现有提交接口与 payload 不变。

**Architecture:** 保持所有改动收敛在 `src/components/admin/TabMarketing.astro` 的现有 modal 与 inline script 内，不改后端接口、不改促销列表卡片结构。通过在前端引入 `specialSelectionState + searchTerm + normalized products` 三个最小状态源，把当前 checkbox 长列表改成“搜索 + 已选区 + 待选区”的双区渲染模型；源码断言测试放到独立测试文件，避免继续污染不相关账单测试。

**Tech Stack:** Astro, browser DOM API, TypeScript-flavored inline script, node:test

---

## File Structure

- `src/components/admin/TabMarketing.astro`
  - 放宽 `promotion-modal` 宽度并调整表单布局
  - 扩展 `loadProducts()`，保存 `sub_name` 并生成标准化菜品对象
  - 新增 special 选择状态、搜索状态、已选区/待选区渲染函数
  - 更新 `openPromotionModal()` / `editPromotion()` / `getSelectedProductIds()` / submit 流程
- `src/pages/admin/promotion-ui.test.ts`
  - 新增独立源码断言测试，覆盖 modal 宽度、special 搜索区、已选区、双语字段渲染、编辑回填与搜索过滤逻辑

### Task 1: 建立促销弹窗源码回归测试

**Files:**
- Create: `src/pages/admin/promotion-ui.test.ts`
- Test: `src/pages/admin/promotion-ui.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts`，先把本次需求固化成源码断言：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const marketingPath = resolve(process.cwd(), 'src/components/admin/TabMarketing.astro');

test('promotion modal source widens layout and exposes special search regions', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.doesNotMatch(file, /max-width:\s*500px/);
  assert.match(file, /width:\s*min\(900px,\s*calc\(100vw\s*-\s*48px\)\)/);
  assert.match(file, /id="promo-product-search"/);
  assert.match(file, /id="promo-selected-products"/);
  assert.match(file, /id="promo-available-products"/);
});

test('promotion special selector source supports bilingual names and selected-state rendering', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /sub_name/);
  assert.match(file, /displayNameSecondary/);
  assert.match(file, /renderSelectedProducts/);
  assert.match(file, /renderAvailableProducts/);
  assert.match(file, /selectedProductIds\.includes\(p\.id\)/);
});

test('promotion edit and search source preserve selection state', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /setPromotionProductSearch\(/);
  assert.match(file, /hydrateSpecialSelection\(/);
  assert.match(file, /searchTerm/);
  assert.match(file, /filter\(\(p\) => \{/);
  assert.match(file, /specialSelectionState\s*=\s*selectedIds/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
历史红灯预期：，因为当前 `TabMarketing.astro` 还没有更宽 modal、special 搜索框、已选区和新的状态渲染函数。

- [ ] **Step 3: Write minimal implementation scaffold**

先在 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabMarketing.astro` 放入最小骨架，让测试锚点存在，但暂时不完成完整行为。

把 modal 容器和 special 区域改成：

```astro
<div id="promotion-modal" class="modal" style="display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); position: fixed; inset: 0; z-index: 1000; padding: 12px; box-sizing: border-box;">
  <div style="background: #fff; border-radius: 12px; padding: 24px; width: min(900px, calc(100vw - 48px)); max-height: 90vh; overflow-y: auto; box-sizing: border-box;">
```

```astro
<div id="promo-special-fields" class="form-group" style="margin-bottom: 15px; display: none;">
  <label style="display: block; margin-bottom: 8px; font-weight: 600;">选择特价菜品</label>
  <input id="promo-product-search" type="text" placeholder="搜索中文名或外文名" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; margin-bottom: 12px;" />
  <div id="promo-selected-products" style="display:flex; flex-wrap:wrap; gap:8px; min-height:40px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; background:#f8fafc; margin-bottom:12px;"></div>
  <div id="promo-available-products" style="display:grid; gap:8px; max-height:320px; overflow-y:auto; border:1px solid #e5e7eb; border-radius:8px; padding:10px;"></div>
</div>
```

并在 script 顶部先声明新的最小状态和空函数：

```ts
let searchTerm = '';
let specialSelectionState = [];

function renderSelectedProducts() {}
function renderAvailableProducts() {}
function setPromotionProductSearch(nextValue) {
  searchTerm = String(nextValue || '').trim().toLowerCase();
}
function hydrateSpecialSelection(selectedIds = []) {
  specialSelectionState = selectedIds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
Expected: PASS，证明新 UI 锚点与状态入口已建立。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts
git commit -m "test: add promotion modal redesign guardrails"
```

### Task 2: 标准化菜品数据并实现双语展示模型

**Files:**
- Modify: `src/components/admin/TabMarketing.astro`
- Test: `src/pages/admin/promotion-ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts` 追加更具体的断言，要求前端读取 `sub_name` 并派生中外文显示字段：

```ts
test('promotion product normalization source derives bilingual display fields', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /displayNamePrimary:\s*String\(p\.name\s*\|\|\s*''\)/);
  assert.match(file, /displayNameSecondary:\s*String\(p\.sub_name\s*\|\|\s*''\)/);
  assert.match(file, /price:\s*Number\(p\.price\s*\|\|\s*0\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
历史红灯预期：，因为当前 `loadProducts()` 只保存 `{ id, name, price }`，没有双语字段归一化。

- [ ] **Step 3: Write minimal implementation**

把 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabMarketing.astro` 中 `loadProducts()` 的 push 逻辑改成标准化结构：

```ts
productsData.push({
  id: Number(p.id || 0),
  name: String(p.name || ''),
  sub_name: String(p.sub_name || ''),
  price: Number(p.price || 0),
  displayNamePrimary: String(p.name || ''),
  displayNameSecondary: String(p.sub_name || ''),
});
```

同时新增一个通过 id 取产品的 helper，避免后面重复 filter：

```ts
function getPromotionProductById(productId) {
  return productsData.find((product) => product.id === Number(productId)) || null;
}
```

再把 special 描述中的名字拼接从旧的 `prod.name` 改成优先主名、其次副名存在时附带显示：

```ts
const names = productsData
  .filter((prod) => ids.includes(prod.id))
  .map((prod) => prod.displayNameSecondary
    ? `${prod.displayNamePrimary} (${prod.displayNameSecondary})`
    : prod.displayNamePrimary);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
Expected: PASS，说明双语显示所需的数据结构已经具备。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts
git commit -m "feat: normalize promotion product display fields"
```

### Task 3: 实现 special 的“已选区 + 待选区 + 搜索过滤”交互

**Files:**
- Modify: `src/components/admin/TabMarketing.astro`
- Test: `src/pages/admin/promotion-ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts` 追加断言，要求 special 选择逻辑具备搜索过滤、已选排除和显式增删函数：

```ts
test('promotion special selector source filters available products and supports add remove actions', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /function addSpecialProduct\(productId\)/);
  assert.match(file, /function removeSpecialProduct\(productId\)/);
  assert.match(file, /const selectedProductIds = specialSelectionState/);
  assert.match(file, /!selectedProductIds\.includes\(p\.id\)/);
  assert.match(file, /primaryText\.includes\(searchTerm\)/);
  assert.match(file, /secondaryText\.includes\(searchTerm\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
历史红灯预期：，因为当前还没有 add/remove、过滤和双区渲染的完整实现。

- [ ] **Step 3: Write minimal implementation**

在 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabMarketing.astro` 增加最小但完整的 special 交互函数：

```ts
function syncSpecialProductUI() {
  renderSelectedProducts();
  renderAvailableProducts();
}

function addSpecialProduct(productId) {
  const nextId = Number(productId || 0);
  if (!nextId) return;
  if (specialSelectionState.includes(nextId)) return;
  specialSelectionState = [...specialSelectionState, nextId];
  syncSpecialProductUI();
}

function removeSpecialProduct(productId) {
  const nextId = Number(productId || 0);
  specialSelectionState = specialSelectionState.filter((id) => id !== nextId);
  syncSpecialProductUI();
}

function renderSelectedProducts() {
  const container = document.getElementById('promo-selected-products');
  if (!container) return;
  clearChildren(container);

  if (!specialSelectionState.length) {
    renderInfo(container, '暂未选择菜品', { color: '#64748b', fontSize: '13px' });
    return;
  }

  specialSelectionState.forEach((productId) => {
    const product = getPromotionProductById(productId);
    if (!product) return;

    const chip = document.createElement('button');
    chip.type = 'button';
    setStyles(chip, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      border: '1px solid #bfdbfe',
      borderRadius: '999px',
      background: '#eff6ff',
      cursor: 'pointer',
    });
    chip.addEventListener('click', () => removeSpecialProduct(product.id));

    const text = product.displayNameSecondary
      ? `${product.displayNamePrimary} (${product.displayNameSecondary}) · ${product.price} RSD`
      : `${product.displayNamePrimary} · ${product.price} RSD`;

    chip.textContent = `${text} ×`;
    container.appendChild(chip);
  });
}

function renderAvailableProducts() {
  const container = document.getElementById('promo-available-products');
  if (!container) return;
  clearChildren(container);

  const selectedProductIds = specialSelectionState;
  const rows = productsData.filter((p) => {
    if (selectedProductIds.includes(p.id)) return false;
    if (!searchTerm) return true;

    const primaryText = String(p.displayNamePrimary || '').toLowerCase();
    const secondaryText = String(p.displayNameSecondary || '').toLowerCase();
    return primaryText.includes(searchTerm) || secondaryText.includes(searchTerm);
  });

  if (!rows.length) {
    renderInfo(container, '没有匹配的菜品', { color: '#64748b', fontSize: '13px' });
    return;
  }

  rows.forEach((product) => {
    const row = document.createElement('div');
    setStyles(row, {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      gap: '10px',
      alignItems: 'center',
      padding: '10px 12px',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      background: '#fff',
    });

    const names = document.createElement('div');
    const primary = document.createElement('div');
    primary.textContent = product.displayNamePrimary;
    setStyles(primary, { fontWeight: '600', color: '#111827' });
    names.appendChild(primary);

    if (product.displayNameSecondary) {
      const secondary = document.createElement('div');
      secondary.textContent = product.displayNameSecondary;
      setStyles(secondary, { fontSize: '12px', color: '#6b7280' });
      names.appendChild(secondary);
    }

    const price = document.createElement('div');
    price.textContent = `${product.price} RSD`;
    setStyles(price, { fontSize: '13px', color: '#475569', whiteSpace: 'nowrap' });

    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = '选择';
    setStyles(action, {
      border: 'none',
      borderRadius: '6px',
      background: '#2563eb',
      color: '#fff',
      padding: '8px 12px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    action.addEventListener('click', () => addSpecialProduct(product.id));

    row.append(names, price, action);
    container.appendChild(row);
  });
}
```

把搜索输入框接上事件：

```ts
const promoProductSearch = document.getElementById('promo-product-search');
if (promoProductSearch) {
  promoProductSearch.addEventListener('input', (event) => {
    const target = event.target;
    setPromotionProductSearch(target && 'value' in target ? target.value : '');
    renderAvailableProducts();
  });
}
```

并把 `getSelectedProductIds()` 改成直接返回状态：

```ts
function getSelectedProductIds() {
  return [...specialSelectionState];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
Expected: PASS，说明 special 区的新交互模型已经落地。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts
git commit -m "feat: add searchable special product selector"
```

### Task 4: 接通创建/编辑流程并完成最终验证

**Files:**
- Modify: `src/components/admin/TabMarketing.astro`
- Test: `src/pages/admin/promotion-ui.test.ts`

- [ ] **Step 1: Write the failing test**

在 `D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts` 追加断言，要求创建/编辑流程会重置搜索、回填已选状态，并只在 special 类型时同步 UI：

```ts
test('promotion modal source resets and hydrates special state for create and edit', async () => {
  const file = await readFile(marketingPath, 'utf8');

  assert.match(file, /function resetSpecialSelectionState\(\)/);
  assert.match(file, /resetSpecialSelectionState\(\);[\s\S]*loadProducts\(\);/);
  assert.match(file, /hydrateSpecialSelection\(selectedIds\);/);
  assert.match(file, /setPromotionProductSearch\(''\);/);
  assert.match(file, /if \(type === 'special'\) \{[\s\S]*syncSpecialProductUI\(\);[\s\S]*\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts"
```
历史红灯预期：，因为当前 open/edit/updatePromoFields 还没有完整串起新状态模型。

- [ ] **Step 3: Write minimal implementation**

在 `D:/ai/food/.worktrees/260311/food2astro/src/components/admin/TabMarketing.astro` 增加状态重置函数：

```ts
function resetSpecialSelectionState() {
  specialSelectionState = [];
  setPromotionProductSearch('');
  const searchInput = document.getElementById('promo-product-search');
  if (searchInput && 'value' in searchInput) searchInput.value = '';
}
```

把 `openPromotionModal()` 改成先清 special 状态，再打开 modal：

```ts
window.openPromotionModal = function() {
  document.getElementById('promotion-modal-title').innerText = '添加促销';
  document.getElementById('promotion-form').reset();
  document.getElementById('promotion-id').value = '';
  resetSpecialSelectionState();
  updatePromoFields();
  document.getElementById('promotion-modal').style.display = 'flex';
  loadProducts();
};
```

把 `editPromotion()` 中旧的 `renderProductList(selectedIds);` 改成状态回填：

```ts
hydrateSpecialSelection(selectedIds);
setPromotionProductSearch('');
```

并把 `updatePromoFields()` 改成在 special 模式下主动同步双区 UI：

```ts
function updatePromoFields() {
  const type = document.getElementById('promotion-type').value;
  document.getElementById('promo-spend-fields').style.display = type === 'spend_discount' ? 'block' : 'none';
  document.getElementById('promo-discount-fields').style.display = type === 'percent_discount' ? 'block' : (type === 'spend_discount' ? 'block' : 'none');
  document.getElementById('promo-points-fields').style.display = type === 'bonus_points' ? 'block' : 'none';
  document.getElementById('promo-special-fields').style.display = type === 'special' ? 'block' : 'none';
  document.getElementById('promo-special-price-field').style.display = type === 'special' ? 'block' : 'none';

  if (type === 'special') {
    syncSpecialProductUI();
  }
}
```

最后把 `loadProducts()` 成功后由旧的 `renderProductList();` 改成：

```ts
if (document.getElementById('promotion-type')?.value === 'special') {
  syncSpecialProductUI();
}
```

- [ ] **Step 4: Run tests to verify everything passes**

Run:
```bash
node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/promotion-ui.test.ts" && node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/admin/billing-ui.test.ts" && node --test "D:/ai/food/.worktrees/260311/food2astro/src/pages/master/dine-in-panel-routing.test.ts"
```
Expected: PASS，新的促销测试通过，且现有 admin 源码断言测试没有被误伤。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TabMarketing.astro src/pages/admin/promotion-ui.test.ts
git commit -m "feat: redesign admin promotion modal"
```

## Manual Verification

- [ ] 打开 `/admin/101` 或任一 admin 页面，进入“营销”tab
- [ ] 点击“添加促销”，确认 modal 桌面端明显更宽，移动端左右有安全边距
- [ ] 切换到“今日特价”，确认可见搜索框、已选区、待选区
- [ ] 待选列表每行单行显示主名 / 副名 / 价格 / 选择按钮
- [ ] 输入中文关键字，结果正确过滤
- [ ] 输入外文关键字，结果正确过滤
- [ ] 选择一个菜品后，已选区立即出现标签，待选区不再重复显示
- [ ] 点击已选标签的移除动作后，该菜回到待选区
- [ ] 编辑已有 `special` 促销，已选菜与特价金额正确回填
- [ ] 保存后促销列表仍正常显示，special 描述能显示双语菜名摘要
