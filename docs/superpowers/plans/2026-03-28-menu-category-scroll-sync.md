# 菜单分类滚动联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让菜单页左侧分类高亮随中间菜单滚动自动同步，并把中间悬浮分类条上移，避免遮住当前分类下的第一排菜品。

**Architecture:** 保持现有 `Sidebar` + `MenuList` + 店铺页装配结构，只补一套共享的活动分类状态与统一顶部偏移基准。`MenuList` 负责滚动观察、悬浮分类条与当前分类计算，`Sidebar` 改成受控高亮显示并使用同一偏移量滚动到目标分类，页面入口负责把两侧接线起来。

**Tech Stack:** Astro, Preact TSX, TypeScript, node:test

---

## File Map

- Modify: `src/components/Sidebar.tsx`
  - 把左侧分类从本地点击态改成受控高亮
  - 点击分类时使用统一偏移量滚动，不再直接滚到 `offsetTop`
- Modify: `src/components/MenuList.tsx`
  - 增加活动分类状态、滚动监听、悬浮分类条顶部偏移常量
  - 输出当前分类给共享容器
  - 用统一偏移量驱动自动高亮和悬浮条位置
- Create: `src/components/shop/ShopMenuShell.tsx`
  - 承接 `Sidebar` 与 `MenuList` 之间共享的活动分类状态
- Modify: `src/pages/[slug]/index.astro`
  - 用 `ShopMenuShell` 替换原本分散挂载的 `Sidebar` 与 `MenuList`
- Modify: `src/pages/menu-list-promotions.test.ts`
  - 新增菜单页分类联动与偏移接线源码断言

---

### Task 1: 锁定分类联动接线与统一偏移基准

**Files:**
- Modify: `src/pages/menu-list-promotions.test.ts`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 写失败测试，锁定店铺页改为共享容器接线**

在 `src/pages/menu-list-promotions.test.ts` 里追加一个测试，断言 `src/pages/[slug]/index.astro` 已改为挂载 `ShopMenuShell`：

```ts
test('shop page source mounts ShopMenuShell for shared menu category state', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /import ShopMenuShell from '\.\.\/\.\.\/components\/shop\/ShopMenuShell\.tsx';/);
  assert.match(file, /<ShopMenuShell[\s\S]*categories=\{activeMenu\}[\s\S]*specialPromotionMap=\{specialPromotionMap\}[\s\S]*spendDiscountPromotion=\{spendDiscountPromotion\}/);
  assert.doesNotMatch(file, /<Sidebar categories=\{activeMenu\} client:load=\{true\} \/>/);
  assert.doesNotMatch(file, /<MenuList[\s\S]*client:load=\{true\}/);
});
```

- [ ] **Step 2: 写失败测试，锁定共享容器持有活动分类状态并向两侧透传**

继续在同一测试文件里追加一个测试，断言 `ShopMenuShell` 自己持有活动分类状态，并把它同时传给 `Sidebar` 和 `MenuList`：

```ts
test('ShopMenuShell source owns shared active category state for sidebar and menu list', async () => {
  const shellPath = new URL('../components/shop/ShopMenuShell.tsx', import.meta.url);
  const file = await readFile(shellPath, 'utf8');

  assert.match(file, /const \[activeCategoryId, setActiveCategoryId\] = useState<string \| undefined>\(initialCategoryId\);/);
  assert.match(file, /<Sidebar categories=\{categories\} activeId=\{activeCategoryId\} stickyOffsetTop=\{56\} \/>/);
  assert.match(file, /<MenuList[\s\S]*activeCategoryId=\{activeCategoryId\}[\s\S]*onActiveCategoryChange=\{setActiveCategoryId\}/);
});
```

- [ ] **Step 3: 写失败测试，锁定 Sidebar 改为受控高亮且点击使用偏移量**

继续在同一测试文件里追加一个测试，断言 `Sidebar` 不再只靠本地状态，并且滚动位置改成减去统一偏移量：

```ts
test('Sidebar source uses controlled active category and offset-based scrolling', async () => {
  const sidebarPath = new URL('../components/Sidebar.tsx', import.meta.url);
  const file = await readFile(sidebarPath, 'utf8');

  assert.match(file, /activeId\?: string;/);
  assert.match(file, /stickyOffsetTop\?: number;/);
  assert.match(file, /export default function Sidebar\(\{ categories, activeId, stickyOffsetTop = 0 \}: SidebarProps\)/);
  assert.doesNotMatch(file, /const \[activeId, setActiveId\] = useState/);
  assert.match(file, /const top = Math\.max\(el\.offsetTop - stickyOffsetTop, 0\);/);
  assert.match(file, /container\.scrollTo\(\{ top, behavior: ['"]smooth['"] \}\);/);
});
```

- [ ] **Step 4: 写失败测试，锁定 MenuList 的统一偏移常量、滚动监听和悬浮分类条接线**

继续追加一个测试，断言 `MenuList` 定义统一偏移基准，并用它同时驱动滚动判定和悬浮分类条：

```ts
test('MenuList source uses one sticky offset constant for active category sync and sticky category bar', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /activeCategoryId\?: string;/);
  assert.match(file, /onActiveCategoryChange\?: \(categoryId: string \| undefined\) => void;/);
  assert.match(file, /const stickyOffsetTop = \d+;/);
  assert.match(file, /const sectionAnchorTop = container\.scrollTop \+ stickyOffsetTop;/);
  assert.match(file, /onActiveCategoryChange\?\.\(nextActiveCategoryId\);/);
  assert.match(file, /position: 'sticky'/);
  assert.match(file, /top: `\$\{stickyOffsetTop\}px`/);
});
```

- [ ] **Step 5: 运行测试，确认当前实现失败**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: FAIL，因为当前 `Sidebar` 仍用本地 `useState`，店铺页还没有共享活动分类接线，`MenuList` 也还没有统一偏移常量和滚动同步逻辑。

- [ ] **Step 6: 提交 Task 1**

```bash
git add src/pages/menu-list-promotions.test.ts
git commit -m "test: lock menu category scroll sync wiring"
```

---

### Task 2: 接入共享活动分类状态并修正 Sidebar 滚动落点

**Files:**
- Create: `src/components/shop/ShopMenuShell.tsx`
- Modify: `src/components/Sidebar.tsx:1-37`
- Modify: `src/pages/[slug]/index.astro:2-10,674-685`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 在店铺页写最小接线实现**

先在 `src/pages/[slug]/index.astro` 里把 `Sidebar` 与 `MenuList` 包进一个很薄的 Preact 容器接线。直接新增 import：

```astro
import ShopMenuShell from '../../components/shop/ShopMenuShell.tsx';
```

并把原来的：

```astro
<div class="app-container">
  <Sidebar categories={activeMenu} client:load={true} />
  <MenuList
    categories={activeMenu}
    specialPromotionMap={specialPromotionMap}
    spendDiscountPromotion={spendDiscountPromotion}
    footerPhone={footerPhone}
    footerCopyright={footerCopyright}
    footerText={footerText}
    menuLayout={menuLayout}
    client:load={true}
  />
</div>
```

改成：

```astro
<div class="app-container">
  <ShopMenuShell
    categories={activeMenu}
    specialPromotionMap={specialPromotionMap}
    spendDiscountPromotion={spendDiscountPromotion}
    footerPhone={footerPhone}
    footerCopyright={footerCopyright}
    footerText={footerText}
    menuLayout={menuLayout}
    client:load
  />
</div>
```

- [ ] **Step 2: 新建共享接线容器组件**

Create: `src/components/shop/ShopMenuShell.tsx`

写入最小容器实现：

```tsx
import { useMemo, useState } from 'preact/hooks';
import Sidebar from '../Sidebar';
import MenuList from '../MenuList';
import type { Category } from '../../types';
import type { SpecialPromotion, SpendDiscountPromotion } from '../../store/cartStore';

interface ShopMenuShellProps {
  categories: Category[];
  specialPromotionMap?: Record<string, SpecialPromotion>;
  spendDiscountPromotion?: SpendDiscountPromotion | null;
  footerPhone?: string;
  footerCopyright?: string;
  footerText?: string;
  menuLayout?: string;
}

export default function ShopMenuShell({
  categories,
  specialPromotionMap = {},
  spendDiscountPromotion = null,
  footerPhone,
  footerCopyright,
  footerText,
  menuLayout = 'image-2col',
}: ShopMenuShellProps) {
  const initialCategoryId = useMemo(() => (categories[0]?.id ? String(categories[0].id) : undefined), [categories]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(initialCategoryId);

  return (
    <>
      <Sidebar categories={categories} activeId={activeCategoryId} stickyOffsetTop={56} />
      <MenuList
        categories={categories}
        specialPromotionMap={specialPromotionMap}
        spendDiscountPromotion={spendDiscountPromotion}
        footerPhone={footerPhone}
        footerCopyright={footerCopyright}
        footerText={footerText}
        menuLayout={menuLayout}
        activeCategoryId={activeCategoryId}
        onActiveCategoryChange={setActiveCategoryId}
      />
    </>
  );
}
```

- [ ] **Step 3: 把 Sidebar 改成受控高亮 + 偏移滚动**

修改 `src/components/Sidebar.tsx`，删除本地 `useState`，改成：

```tsx
import type { Category } from '../types';

interface SidebarProps {
  categories: Category[];
  activeId?: string;
  stickyOffsetTop?: number;
}

export default function Sidebar({ categories, activeId, stickyOffsetTop = 0 }: SidebarProps) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    const container = document.getElementById('scrollContainer');
    if (el && container) {
      const top = Math.max(el.offsetTop - stickyOffsetTop, 0);
      container.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div className="app-sidebar">
      {categories.map((cat) => (
        <div
          key={cat.id}
          className={`sidebar-item ${activeId === String(cat.id) ? 'active' : ''}`}
          onClick={() => scrollTo(String(cat.id))}
        >
          <span className="cat-name-main">{cat.name}</span>
          {cat.subName && <span className="cat-name-sub">{cat.subName}</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试，确认接线与 Sidebar 通过**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: 仍可能 FAIL，但失败点应只剩 `MenuList` 还未实现 `stickyOffsetTop`、滚动监听、悬浮分类条联动。

- [ ] **Step 5: 提交 Task 2**

```bash
git add src/components/Sidebar.tsx src/components/shop/ShopMenuShell.tsx src/pages/[slug]/index.astro src/pages/menu-list-promotions.test.ts
git commit -m "refactor: share active menu category state"
```

---

### Task 3: 在 MenuList 中实现滚动同步与悬浮分类条上移

**Files:**
- Modify: `src/components/MenuList.tsx:1-256`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 给 MenuList 增加受控活动分类 props 和统一偏移常量**

修改 `MenuListProps`，追加：

```tsx
  activeCategoryId?: string;
  onActiveCategoryChange?: (categoryId: string | undefined) => void;
```

并在组件顶部解构：

```tsx
  activeCategoryId,
  onActiveCategoryChange,
```

然后在函数内部补齐统一偏移：

```tsx
  const stickyOffsetTop = 56;
```

- [ ] **Step 2: 写最小滚动同步实现**

在 `src/components/MenuList.tsx` 顶部把 hooks import 改成：

```tsx
import { useEffect, useMemo, useState } from 'preact/hooks';
```

然后补上分类列表与滚动监听：

```tsx
  const menuCategoryEntries = useMemo(
    () => categories.map((cat) => ({ id: String(cat.id), name: cat.name, subName: cat.subName || '' })),
    [categories],
  );

  useEffect(() => {
    const container = document.getElementById('scrollContainer');
    if (!container) return;

    const syncActiveCategory = () => {
      const sectionIds = menuCategoryEntries.map((cat) => cat.id);
      const sectionAnchorTop = container.scrollTop + stickyOffsetTop;
      let nextActiveCategoryId = sectionIds[0];

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);
        if (!section) continue;
        if (section.offsetTop <= sectionAnchorTop) {
          nextActiveCategoryId = sectionId;
        }
      }

      onActiveCategoryChange?.(nextActiveCategoryId);
    };

    syncActiveCategory();
    container.addEventListener('scroll', syncActiveCategory, { passive: true });
    return () => container.removeEventListener('scroll', syncActiveCategory);
  }, [menuCategoryEntries, onActiveCategoryChange]);
```

- [ ] **Step 3: 写悬浮分类条，并把 top 绑定到同一偏移常量**

在 `MenuList` 顶部计算当前活动分类对象：

```tsx
  const activeMenuCategory = menuCategoryEntries.find((category) => category.id === activeCategoryId) ?? menuCategoryEntries[0];
```

然后在满减条和今日特价分类之后、普通分类列表之前插入：

```tsx
      {activeMenuCategory && (
        <div
          style={{
            position: 'sticky',
            top: `${stickyOffsetTop}px`,
            zIndex: 20,
            marginBottom: '12px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.96)',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: '800', color: '#1f2937', lineHeight: '1.2' }}>
            {activeMenuCategory.name}
          </div>
          {activeMenuCategory.subName && (
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', lineHeight: '1.2' }}>
              {activeMenuCategory.subName}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: 给分类 section 增加顶部可视安全距离**

把普通分类 section 从：

```tsx
        <div key={cat.id} id={String(cat.id)} className="menu-section" style={{ marginBottom: '20px' }}>
```

改成：

```tsx
        <div
          key={cat.id}
          id={String(cat.id)}
          className="menu-section"
          style={{ marginBottom: '20px', scrollMarginTop: `${stickyOffsetTop + 12}px` }}
        >
```

这样点击滚动和手动滚动都能给首排菜品留出空间。

- [ ] **Step 5: 运行测试，确认菜单联动实现通过**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS，说明店铺页接线、Sidebar 偏移滚动、MenuList 滚动同步与悬浮分类条上移都已满足源码断言。

- [ ] **Step 6: 提交 Task 3**

```bash
git add src/components/MenuList.tsx src/pages/menu-list-promotions.test.ts
git commit -m "feat: sync menu categories with scroll position"
```

---

### Task 4: 运行回归并确认 diff 范围

**Files:**
- Test only: `src/pages/menu-list-promotions.test.ts`
- Test only: `src/lib/cart-store-promotions.test.ts`
- Test only: `src/lib/cart-order-submit-promotions.test.ts`
- Inspect diff: `src/components/Sidebar.tsx`
- Inspect diff: `src/components/shop/ShopMenuShell.tsx`
- Inspect diff: `src/components/MenuList.tsx`
- Inspect diff: `src/pages/[slug]/index.astro`

- [ ] **Step 1: 运行菜单页促销与分类联动测试**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: PASS.

- [ ] **Step 2: 运行促销价格链路回归**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts src/lib/cart-order-submit-promotions.test.ts
```

Expected: PASS，因为本次只改菜单页滚动联动和悬浮分类条位置，不应影响促销价格逻辑。

- [ ] **Step 3: 检查最终 diff 只落在预期文件**

Run:
```bash
git diff -- src/components/Sidebar.tsx src/components/shop/ShopMenuShell.tsx src/components/MenuList.tsx src/pages/[slug]/index.astro src/pages/menu-list-promotions.test.ts
```

Expected: Diff 只包含共享活动分类接线、Sidebar 偏移滚动、MenuList 滚动同步/悬浮分类条上移，以及对应测试更新。

- [ ] **Step 4: 提交最终批次**

```bash
git add src/components/Sidebar.tsx src/components/shop/ShopMenuShell.tsx src/components/MenuList.tsx src/pages/[slug]/index.astro src/pages/menu-list-promotions.test.ts
git commit -m "fix: align menu category scroll sync"
```
