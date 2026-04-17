# Promotion Surface Visual Alignment Implementation Plan

> 状态说明（历史计划）：这份计划记录的是 promotion surface 视觉收口时的实施步骤；文中的 `历史红灯预期：` 只代表当时源码断言阶段，不应直接当作当前实现状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整菜单页顶部促销展示，让满减活动变成单行规则条，并把今日特价改成一组复用普通菜单样式的前置商品列表，仅在存在特价商品时显示。

**Architecture:** 只修改 `src/components/MenuList.tsx` 的前台展示结构，不改动促销数据来源、归一化逻辑、购物车价格链路或现有加购/滚动定位行为。测试继续放在源码断言文件 `src/pages/menu-list-promotions.test.ts`，用正则锁定单行满减规则条，以及“今日特价不再单独成模块、而是以前置菜单项渲染”的结构。

**Tech Stack:** Astro, Preact TSX, TypeScript, node:test

---

## File Map

- Modify: `src/components/MenuList.tsx`
  - 负责顶部 `满减活动` 的展示结构
  - 移除独立 `今日特价` 模块
  - 把特价商品改为复用普通菜单样式的前置商品列表
- Modify: `src/pages/menu-list-promotions.test.ts`
  - 负责验证菜单页促销区的源码结构
  - 增加单行满减断言
  - 更新今日特价为“无模块标题、前置菜单项”断言

---

### Task 1: 调整满减活动为单行规则条

**Files:**
- Modify: `src/components/MenuList.tsx:42-92`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 写失败测试，锁定满减单行结构与数字高亮**

在 `src/pages/menu-list-promotions.test.ts` 的 `MenuList source renders spend discount block only when active promo exists` 测试里，把旧断言替换为更精确的单行结构断言：

```ts
assert.match(file, /const spendDiscountBannerCopy = getSpendDiscountBannerCopy\(spendDiscountPromotion\);/);
assert.match(file, /const spendDiscountParts = spendDiscountBannerCopy\?\.match\(/);
assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#111827' \}\}>满减活动<\/span>/);
assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>满<\/span>/);
assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#dc2626' \}\}>\{spendDiscountParts\?\.\[1\]\}<\/span>/);
assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>减<\/span>/);
assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#dc2626' \}\}>\{spendDiscountParts\?\.\[2\]\}<\/span>/);
assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>RSD<\/span>/);
```

- [ ] **Step 2: 运行测试，确认当前实现失败**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

历史红灯预期：，因为当前实现如果还未更新到单行规则条，就不会满足新的源码断言。

- [ ] **Step 3: 用最小改动实现单行规则条**

在 `src/components/MenuList.tsx` 里，保留并补齐这两行：

```tsx
const spendDiscountBannerCopy = getSpendDiscountBannerCopy(spendDiscountPromotion);
const spendDiscountParts = spendDiscountBannerCopy?.match(/^满\s*(\d+)\s*减\s*(\d+)\s*RSD$/);
```

并把满减展示改成：

```tsx
{spendDiscountBannerCopy && spendDiscountParts && (
  <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fffaf0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
    <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>满减活动</span>
    <span style={{ fontSize: '15px', color: '#111827' }}>满</span>
    <span style={{ fontSize: '15px', fontWeight: '800', color: '#dc2626' }}>{spendDiscountParts?.[1]}</span>
    <span style={{ fontSize: '15px', color: '#111827' }}>减</span>
    <span style={{ fontSize: '15px', fontWeight: '800', color: '#dc2626' }}>{spendDiscountParts?.[2]}</span>
    <span style={{ fontSize: '15px', color: '#111827' }}>RSD</span>
  </div>
)}
```

- [ ] **Step 4: 重跑测试，确认通过**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交 Task 1**

```bash
git add src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
git commit -m "refactor: align spend discount banner layout"
```

---

### Task 2: 把今日特价改成前置菜单项，不再单独成模块

**Files:**
- Modify: `src/components/MenuList.tsx:94-145`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 写失败测试，锁定“无标题模块 + 前置菜单项”结构**

在 `src/pages/menu-list-promotions.test.ts` 里，把旧的今日特价布局断言替换为前置菜单项结构断言。新增一个测试：

```ts
test('MenuList source renders special products as menu-style items before categories without standalone today special module', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /\{activeSpecialPromotionProducts\.length > 0 && \(/);
  assert.match(file, /activeSpecialPromotionProducts\.map\(\(product\) => \{/);
  assert.match(file, /<div className=\{`menu-grid-adaptive \$\{isOneCol \? 'layout-1col' : 'layout-2col'\}`\}>/);
  assert.match(file, /const qty = \$cart\[product\.productId\]\?\.quantity \|\| 0;/);
  assert.match(file, /const hasImg = false;/);
  assert.match(file, /<div key=\{product\.productId\} id=\{`menu-product-\$\{String\(product\.productId\)\}`\} style=\{itemStyle\}>/);
  assert.match(file, /<div style=\{\{ fontSize: isTextMode \? '15px' : '13px', fontWeight: '700', color: '#1a202c'/);
  assert.match(file, /\{product\.productName\}/);
  assert.match(file, /\{product\.productSubName\}/);
  assert.match(file, /\{displayPrice\} <small style=\{\{fontSize:'9px', fontWeight:'normal', opacity:0\.7\}\}>RSD<\/small>/);
  assert.match(file, /\{originalPrice\} RSD/);
  assert.doesNotMatch(file, /<div style=\{\{ fontSize: '16px', fontWeight: '800', color: '#2d3748', marginBottom: '10px' \}\}>今日特价<\/div>/);
  assert.doesNotMatch(file, /<span style=\{\{ fontSize: '10px', fontWeight: '700', color: '#c53030', background: '#fed7d7', borderRadius: '999px', padding: '2px 6px', flexShrink: 0 \}\}>\s*今日特价\s*<\/span>/);
});
```

- [ ] **Step 2: 运行测试，确认当前实现失败**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

历史红灯预期：，因为当前实现仍然保留独立 `今日特价` 标题模块和专用卡片结构。

- [ ] **Step 3: 用最小改动实现前置菜单项结构**

在 `src/components/MenuList.tsx` 中，删除当前独立 `今日特价` 容器：

```tsx
{activeSpecialPromotionProducts.length > 0 && (
  <div style={{ marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
    <div style={{ fontSize: '16px', fontWeight: '800', color: '#2d3748', marginBottom: '10px' }}>今日特价</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
      ...
    </div>
  </div>
)}
```

改成直接复用普通菜单项网格，并放在 `categories.map(...)` 之前：

```tsx
{activeSpecialPromotionProducts.length > 0 && (
  <div className={`menu-grid-adaptive ${isOneCol ? 'layout-1col' : 'layout-2col'}`} style={{ marginBottom: '20px' }}>
    {activeSpecialPromotionProducts.map((product) => {
      const qty = $cart[product.productId]?.quantity || 0;
      const { displayPrice, originalPrice, isSpecialPrice } = getSpecialPriceDisplay(
        { id: product.productId, price: product.originalPrice },
        specialPromotionMap,
      );
      const hasImg = false;
```

并在同一 map 内直接复用普通菜单项的主体结构，至少保持下面这些关键片段一致：

```tsx
const itemStyle = isTextMode ? {
  background: '#fff',
  borderRadius: '10px',
  display: 'flex',
  flexDirection: 'row' as const,
  padding: isOneCol ? '10px 12px' : '8px 10px',
  minHeight: '60px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  border: '1px solid #f0f4f8',
  position: 'relative' as const,
  alignItems: 'center',
  overflow: 'hidden'
} : {
  background: '#fff',
  borderRadius: '10px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'row' as const,
  padding: '6px',
  minHeight: '95px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
  border: '1px solid #f0f4f8',
  position: 'relative' as const
};

return (
  <div key={product.productId} id={`menu-product-${String(product.productId)}`} style={itemStyle}>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: isTextMode ? 'center' : 'space-between', minWidth: 0, paddingLeft: '4px' }}>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: isTextMode ? '15px' : '13px', fontWeight: '700', color: '#1a202c', lineHeight: '1.2', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.productName}</div>
        <div style={{ fontSize: '11px', color: '#a0aec0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.productSubName}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: isTextMode ? '4px' : 'auto', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ color: '#e53e3e', fontWeight: '800', fontSize: isTextMode ? (isOneCol ? '16px' : '14px') : '14px', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayPrice} <small style={{fontSize:'9px', fontWeight:'normal', opacity:0.7}}>RSD</small>
          </div>
          {isSpecialPrice && (
            <div style={{ fontSize: '11px', color: '#a0aec0', textDecoration: 'line-through', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {originalPrice} RSD
            </div>
          )}
        </div>
```

并保留普通菜单项同样的加购控件：

```tsx
<div style={{ flexShrink: 0, marginLeft: '4px' }}>
  {qty === 0 ? (
    <button type="button" onClick={() => addToCart({ id: Number(product.productId), name: product.productName, subName: product.productSubName, price: product.originalPrice })} style={{ width: isTextMode ? (isOneCol ? '28px' : '24px') : '24px', height: isTextMode ? (isOneCol ? '28px' : '24px') : '24px', borderRadius: '50%', background: '#ff4b33', color: '#fff', border: 'none', fontSize: isTextMode ? (isOneCol ? '20px' : '18px') : '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background:'#f7fafc', borderRadius:'12px', padding:'2px', border: '1px solid #edf2f7' }}>
      <button type="button" onClick={() => removeOne(product.productId)} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#4a5568', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
      <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '14px', textAlign: 'center' }}>{qty}</span>
      <button type="button" onClick={() => addToCart({ id: Number(product.productId), name: product.productName, subName: product.productSubName, price: product.originalPrice })} style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: '#ff4b33', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
  )}
</div>
```

关键约束：
- 不再输出 `今日特价` 标题
- 不再输出独立浅色模块容器
- 不再输出商品内 `今日特价` 胶囊标签
- 没有特价商品时仍通过 `activeSpecialPromotionProducts.length > 0` 整组不渲染

- [ ] **Step 4: 重跑测试，确认通过**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交 Task 2**

```bash
git add src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
git commit -m "refactor: inline special promotions into menu list"
```

---

### Task 3: 运行促销展示回归

**Files:**
- Test only: `src/pages/menu-list-promotions.test.ts`
- Test only: `src/lib/cart-store-promotions.test.ts`
- Test only: `src/lib/cart-order-submit-promotions.test.ts`

- [ ] **Step 1: 运行菜单页促销测试**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 2: 运行促销辅助与购物车回归**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts src/lib/cart-order-submit-promotions.test.ts
```

Expected: PASS，因为这次只改展示，不应影响促销归一化和购物车价格链路。

- [ ] **Step 3: 检查最终 diff 只落在预期文件**

Run:
```bash
git diff -- src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
```

Expected: Diff 只包含满减单行规则条，以及“今日特价从独立模块改成前置菜单项”的结构调整。

- [ ] **Step 4: 提交最终批次**

```bash
git add src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
git commit -m "refactor: align storefront promotion layout"
```
