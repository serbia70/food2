# Belgrade 时区统一与前台促销展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 special promotion 与相关统计的 Europe/Belgrade 时间语义，并在店铺页增加“今日特价”模块与明确的促销价格展示。

**Architecture:** 前端把 special promotion 的生效判断、商品展开、价格映射和“今日特价”模块数据收敛到 `src/store/cartStore.ts` 的同一套归一化逻辑中，保证菜单、购物车、顶部模块三处价格与时间语义一致。后端继续复用 `orderNoLocation`、`belgradeNow()`、`belgradeDayRange()`、`belgradeMonthRange()` 这套边界工具，把 today/month 统计与 promotion 时间解析全部改成显式区间比较。

**Tech Stack:** Astro, Preact, TypeScript, nanostores, Node.js test runner, Go, Gin, SQLite

---

## File Structure

- `src/store/cartStore.ts` — special promotion 的 Belgrade 时间解析、去重、价格映射、顶部模块商品归一化
- `src/components/MenuList.tsx` — 菜单卡片价格位促销态、顶部“今日特价”模块渲染与滚动定位
- `src/pages/[slug]/index.astro` — 向前台传递 promotions 与菜单数据，不新增接口
- `src/components/CartModal.tsx` — 继续使用同一套 special price 映射，保证购物车和菜单一致
- `src/lib/cart-store-promotions.test.ts` — 前端促销生效、去重、Belgrade 时间语义测试
- `src/pages/menu-list-promotions.test.ts` — 菜单卡片促销态和“今日特价”模块源码回归断言
- `src/pages/shop-promotions-surface.test.ts` — 店铺页 props 透传与顶部模块源码断言
- `foos2Go/internal/handlers/order_numbering.go` — Belgrade 时间 helper
- `foos2Go/internal/handlers/promotions.go` — promotion 时间解析与月统计区间
- `foos2Go/internal/handlers/master_init_data.go` — today/month 统计区间
- `foos2Go/internal/handlers/reservation.go` — 预约时间解析与今日统计口径
- `foos2Go/internal/handlers/master_stats_test.go` — 后端 today/month 边界回归测试

### Task 1: 扩展前端促销归一化能力

**Files:**
- Modify: `src/store/cartStore.ts`
- Test: `src/lib/cart-store-promotions.test.ts`

- [ ] **Step 1: 写失败测试，锁定 special 去重与“今日特价”数据输出**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveSpecialPromotionProducts,
  setSpecialPromotions,
} from '../store/cartStore.ts';

const products = [
  { id: 201, name: '烤肉饭', sub_name: 'Pljeskavica', price: 1500 },
  { id: 202, name: '薯条', sub_name: 'Pomfrit', price: 600 },
];

test('getActiveSpecialPromotionProducts returns deduplicated active products for hero section', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    setSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [201],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
        ends_at: '2026-03-27 19:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [201, 202],
        special_price_rsd: 1099,
        starts_at: '2026-03-27 17:00:00',
        ends_at: '2026-03-27 20:00:00',
      },
    ]);

    assert.deepEqual(getActiveSpecialPromotionProducts(products), [
      {
        productId: '201',
        productName: '烤肉饭',
        productSubName: 'Pljeskavica',
        originalPrice: 1500,
        specialPrice: 999,
      },
      {
        productId: '202',
        productName: '薯条',
        productSubName: 'Pomfrit',
        originalPrice: 600,
        specialPrice: 1099,
      },
    ]);
  } finally {
    Date.now = realNow;
    setSpecialPromotions([]);
  }
});
```

- [ ] **Step 2: 运行测试，确认当前实现还没有顶部模块数据 API**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts
```

Expected: FAIL，报 `getActiveSpecialPromotionProducts` 未导出或断言不通过。

- [ ] **Step 3: 在 `cartStore.ts` 加最小实现，统一 special price 映射与顶部模块数据**

```ts
export interface ActiveSpecialPromotionProduct {
  productId: string;
  productName: string;
  productSubName: string;
  originalPrice: number;
  specialPrice: number;
}

function comparePromotionPriority(
  nextPromotion: SpecialPromotion,
  currentPromotion?: SpecialPromotion,
) {
  if (!currentPromotion) return true;
  if (nextPromotion.specialPrice !== currentPromotion.specialPrice) {
    return nextPromotion.specialPrice < currentPromotion.specialPrice;
  }
  return nextPromotion.sortKey < currentPromotion.sortKey;
}

function normalizeSpecialPromotions(promotions: unknown): Record<string, SpecialPromotion> {
  if (!Array.isArray(promotions)) return {};
  const now = Date.now();
  return promotions.reduce<Record<string, SpecialPromotion>>((acc, promotion, index) => {
    const record = promotion as PromotionRecord;
    if (!isPromotionActive(record, now)) return acc;
    const specialPrice = Number(record.special_price_rsd || 0);
    if (!Number.isFinite(specialPrice) || specialPrice <= 0) return acc;
    const sortKey = index;
    const productIds = parseSelectedProductIds(record.selected_products);
    productIds.forEach((productId) => {
      const nextPromotion = { productId, specialPrice, sortKey };
      if (comparePromotionPriority(nextPromotion, acc[productId])) {
        acc[productId] = nextPromotion;
      }
    });
    return acc;
  }, {});
}

export function getActiveSpecialPromotionProducts(
  products: Array<{ id: string | number; name?: string; sub_name?: string; subName?: string; price?: number }>,
) {
  const promotions = specialPromotions.get();
  return products
    .map((product, index) => {
      const productId = toProductKey(product.id);
      const special = promotions[productId];
      if (!special) return null;
      return {
        productId,
        productName: String(product.name || ''),
        productSubName: String(product.sub_name || product.subName || ''),
        originalPrice: Number(product.price || 0),
        specialPrice: special.specialPrice,
        sortPrice: special.specialPrice,
        sortIndex: index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortPrice - b.sortPrice || a.sortIndex - b.sortIndex)
    .map(({ sortPrice, sortIndex, ...item }) => item);
}
```

- [ ] **Step 4: 运行测试，确认前端促销归一化通过**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts
```

Expected: PASS，包含已有 3 条测试和新加的“deduplicated active products”测试。

- [ ] **Step 5: 提交当前任务**

```bash
git add src/store/cartStore.ts src/lib/cart-store-promotions.test.ts
git commit -m "feat: normalize active special promotion products"
```

### Task 2: 实现店铺页“今日特价”模块

**Files:**
- Modify: `src/components/MenuList.tsx`
- Modify: `src/pages/[slug]/index.astro`
- Test: `src/pages/menu-list-promotions.test.ts`
- Test: `src/pages/shop-promotions-surface.test.ts`

- [ ] **Step 1: 写失败测试，锁定“今日特价”模块与 props 透传**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const menuListPath = new URL('../components/MenuList.tsx', import.meta.url);
const shopPagePath = new URL('./[slug]/index.astro', import.meta.url);

test('MenuList source renders hero section for active special promotions only', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /getActiveSpecialPromotionProducts/);
  assert.match(file, /今日特价/);
  assert.match(file, /activeSpecialPromotionProducts\.length > 0/);
  assert.match(file, /scrollIntoView/);
});

test('shop page forwards promotions and categories to MenuList hero section', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /const promotionsData = Array\.isArray\(shop\?\.promotions\) \? shop\.promotions : \[\]/);
  assert.match(file, /<MenuList[\s\S]*promotions=\{promotionsData\}/);
});
```

- [ ] **Step 2: 运行测试，确认当前没有“今日特价”模块入口**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts
```

Expected: FAIL，报 `getActiveSpecialPromotionProducts`、`今日特价` 或 `promotions={promotionsData}` 断言不成立。

- [ ] **Step 3: 在 `MenuList.tsx` 和店铺页加入最小实现**

```tsx
import {
  cartItems,
  addToCart,
  removeOne,
  resolveCartItemUnitPrice,
  specialPromotions,
  getActiveSpecialPromotionProducts,
} from '../store/cartStore';

interface MenuListProps {
  categories: Category[];
  promotions?: unknown;
  footerPhone?: string;
  footerCopyright?: string;
  footerText?: string;
  menuLayout?: string;
}

export default function MenuList({
  categories,
  promotions,
  footerPhone,
  footerCopyright,
  footerText,
  menuLayout = 'image-2col',
}: MenuListProps) {
  const $specialPromotions = useStore(specialPromotions);
  const allProducts = categories.flatMap((category) => category.products || []);
  const activeSpecialPromotionProducts = getActiveSpecialPromotionProducts(allProducts);

  const scrollToProduct = (productId: string) => {
    const target = document.getElementById(`product-${productId}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="app-content" id="scrollContainer" ...>
      {activeSpecialPromotionProducts.length > 0 && (
        <section style={{ marginBottom: '16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '12px' }}>
          <div style={{ fontWeight: '800', color: '#c2410c', marginBottom: '10px' }}>今日特价</div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {activeSpecialPromotionProducts.map((item) => (
              <button
                key={item.productId}
                type="button"
                onClick={() => scrollToProduct(item.productId)}
                style={{ textAlign: 'left', background: '#fff', border: '1px solid #fdba74', borderRadius: '10px', padding: '10px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: '700', color: '#1f2937' }}>{item.productName}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.productSubName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ color: '#dc2626', fontWeight: '800' }}>{item.specialPrice} RSD</span>
                  <span style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '12px' }}>{item.originalPrice} RSD</span>
                  <span style={{ fontSize: '11px', color: '#fff', background: '#ef4444', borderRadius: '999px', padding: '2px 8px' }}>今日特价</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {categories.map((cat) => (
        <div key={cat.id} ...>
          {cat.products.map((p) => {
            const displayPrice = resolveCartItemUnitPrice(p, $specialPromotions);
            return (
              <div key={p.id} id={`product-${p.id}`} style={itemStyle}>
                ...
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

```astro
<MenuList
  categories={activeMenu}
  promotions={promotionsData}
  footerPhone={footerPhone}
  footerCopyright={footerCopyright}
  footerText={footerText}
  menuLayout={menuLayout}
  client:load={true}
/>
```

- [ ] **Step 4: 运行测试，确认“今日特价”模块入口已建立**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts
```

Expected: PASS，源码断言能看到 `getActiveSpecialPromotionProducts`、`今日特价`、`scrollIntoView` 和 `promotions={promotionsData}`。

- [ ] **Step 5: 提交当前任务**

```bash
git add src/components/MenuList.tsx src/pages/[slug]/index.astro src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts
git commit -m "feat: add shop special promotion hero section"
```

### Task 3: 把菜单价格位改成明确促销态

**Files:**
- Modify: `src/components/MenuList.tsx`
- Modify: `src/components/CartModal.tsx`
- Test: `src/pages/menu-list-promotions.test.ts`

- [ ] **Step 1: 写失败测试，锁定菜单卡片“活动价 + 原价删除线 + 标签”**

```ts
test('MenuList source renders promotion badge and original price for special products', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /const isSpecialPrice = displayPrice < Number\(p\.price \|\| 0\)/);
  assert.match(file, /textDecoration:\s*'line-through'/);
  assert.match(file, /今日特价/);
  assert.match(file, /\{displayPrice\} <small/);
});
```

- [ ] **Step 2: 运行测试，确认当前卡片还只有单一价格**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts
```

Expected: FAIL，缺少 `isSpecialPrice`、删除线或 `今日特价` 标签。

- [ ] **Step 3: 在 `MenuList.tsx` 和 `CartModal.tsx` 加最小实现，保证展示与结算一致**

```tsx
{cat.products.map((p) => {
  const displayPrice = resolveCartItemUnitPrice(p, $specialPromotions);
  const originalPrice = Number(p.price || 0);
  const isSpecialPrice = displayPrice < originalPrice;

  return (
    <div key={p.id} id={`product-${p.id}`} style={itemStyle}>
      ...
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ color: '#e53e3e', fontWeight: '800', fontSize: isTextMode ? (isOneCol ? '16px' : '14px') : '14px' }}>
            {displayPrice} <small style={{ fontSize: '9px', fontWeight: 'normal', opacity: 0.7 }}>RSD</small>
          </div>
          {isSpecialPrice && (
            <span style={{ fontSize: '11px', color: '#fff', background: '#ef4444', borderRadius: '999px', padding: '2px 8px' }}>
              今日特价
            </span>
          )}
        </div>
        {isSpecialPrice && (
          <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>
            {originalPrice} RSD
          </div>
        )}
      </div>
      ...
    </div>
  );
})}
```

```tsx
<div className="cart-item-price">
  {resolveCartItemUnitPrice(item, $specialPromotions)} RSD
  {resolveCartItemUnitPrice(item, $specialPromotions) < Number(item.price || 0) && (
    <span style={{ marginLeft: '6px', color: '#94a3b8', textDecoration: 'line-through', fontSize: '12px' }}>
      {Number(item.price || 0)} RSD
    </span>
  )}
</div>
```

- [ ] **Step 4: 运行测试，确认菜单促销态回归通过**

Run:
```bash
node --test src/pages/menu-list-promotions.test.ts src/lib/cart-store-promotions.test.ts
```

Expected: PASS，菜单卡片存在标签与原价删除线，购物车相关旧测试仍通过。

- [ ] **Step 5: 提交当前任务**

```bash
git add src/components/MenuList.tsx src/components/CartModal.tsx src/pages/menu-list-promotions.test.ts
git commit -m "feat: show special promotion state in menu pricing"
```

### Task 4: 收口后端剩余贝尔格莱德统计边界

**Files:**
- Modify: `foos2Go/internal/handlers/order_numbering.go`
- Modify: `foos2Go/internal/handlers/promotions.go`
- Modify: `foos2Go/internal/handlers/master_init_data.go`
- Modify: `foos2Go/internal/handlers/reservation.go`
- Test: `foos2Go/internal/handlers/master_stats_test.go`

- [ ] **Step 1: 写失败测试，锁定 today/month 都走 Belgrade 区间而不是裸 `time.Now()`**

```go
func TestBuildMasterStatsSourceUsesBelgradeWindowHelpers(t *testing.T) {
	body := readMasterInitDataSource(t)
	for _, needle := range []string{
		`belgradeNow()`,
		`belgradeDayRange(now)`,
		`belgradeMonthRange(now)`,
		`datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`,
	} {
		if !strings.Contains(body, needle) {
			t.Fatalf("expected master_init_data.go to contain %s", needle)
		}
	}
}
```

- [ ] **Step 2: 运行定向测试，确认仍有遗漏链路或断言未覆盖**

Run:
```bash
go test ./internal/handlers -run "TestBelgradeDayRange|TestBuildMasterShopSummaryUsesBelgradeDayWindow|TestBuildMasterStatsSourceUsesBelgradeWindowHelpers"
```

Expected: FAIL，如果 `master_init_data.go`、`promotions.go`、`reservation.go` 仍有残余 `time.Now()` / `LIKE` / `date('now')` 边界写法。

- [ ] **Step 3: 在 handlers 中做最小实现，全部改成显式 Belgrade 区间**

```go
func belgradeNow() time.Time {
	return time.Now().In(orderNoLocation)
}

func belgradeDayRange(now time.Time) (string, string) {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, orderNoLocation)
	end := start.AddDate(0, 0, 1)
	return start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05")
}

func belgradeMonthRange(now time.Time) (string, string) {
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, orderNoLocation)
	end := start.AddDate(0, 1, 0)
	return start.Format("2006-01-02 15:04:05"), end.Format("2006-01-02 15:04:05")
}
```

```go
now := belgradeNow()
dayStart, dayEnd := belgradeDayRange(now)
monthStart, monthEnd := belgradeMonthRange(now)

rows, err := db.DB.Query(`
	SELECT id, order_type, total_amount
	FROM orders
	WHERE shop_id = ?
	AND datetime(created_at) >= datetime(?)
	AND datetime(created_at) < datetime(?)
`, shopID, dayStart, dayEnd)
```

```go
if t, err := time.ParseInLocation("2006-01-02 15:04:05", text, orderNoLocation); err == nil {
	return &t
}
```

```go
today := belgradeNow().Format("2006-01-02")
```

- [ ] **Step 4: 运行定向测试，确认后端时区边界回归通过**

Run:
```bash
go test ./internal/handlers -run "TestBelgradeDayRange|TestBuildMasterShopSummaryUsesBelgradeDayWindow|TestBuildMasterStatsSourceUsesBelgradeWindowHelpers"
```

Expected: PASS，today/month 统计断言和源码断言全部通过。

- [ ] **Step 5: 提交当前任务**

```bash
git add internal/handlers/order_numbering.go internal/handlers/promotions.go internal/handlers/master_init_data.go internal/handlers/reservation.go internal/handlers/master_stats_test.go
git commit -m "fix: align handler statistics with belgrade time windows"
```

### Task 5: 运行最终回归并清理交付

**Files:**
- Modify: `src/store/cartStore.ts`
- Modify: `src/components/MenuList.tsx`
- Modify: `src/pages/[slug]/index.astro`
- Modify: `src/components/CartModal.tsx`
- Modify: `foos2Go/internal/handlers/*.go`
- Test: `src/lib/cart-store-promotions.test.ts`
- Test: `src/pages/menu-list-promotions.test.ts`
- Test: `src/pages/shop-promotions-surface.test.ts`
- Test: `foos2Go/internal/handlers/master_stats_test.go`

- [ ] **Step 1: 运行前端定向测试，确认促销链路全部通过**

Run:
```bash
node --test src/lib/cart-store-promotions.test.ts src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts
```

Expected: PASS，输出全部测试通过。

- [ ] **Step 2: 运行后端定向测试，确认贝尔格莱德边界测试全部通过**

Run:
```bash
go test ./internal/handlers -run "TestBuildMasterShopSummaryStats|TestBelgradeDayRange|TestBuildMasterShopSummaryUsesBelgradeDayWindow|TestBuildMasterStatsSourceUsesBelgradeWindowHelpers"
```

Expected: PASS，handlers 定向测试通过。

- [ ] **Step 3: 运行项目构建，确认 Astro 页面与前端类型没有被破坏**

Run:
```bash
pnpm build
```

Expected: PASS，构建完成，无新的页面或类型错误。

- [ ] **Step 4: 检查最终 diff，只保留本次需求相关改动**

Run:
```bash
git diff -- src/store/cartStore.ts src/components/MenuList.tsx src/pages/[slug]/index.astro src/components/CartModal.tsx src/lib/cart-store-promotions.test.ts src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts ../foos2Go/internal/handlers/order_numbering.go ../foos2Go/internal/handlers/promotions.go ../foos2Go/internal/handlers/master_init_data.go ../foos2Go/internal/handlers/reservation.go ../foos2Go/internal/handlers/master_stats_test.go
```

Expected: 只看到 Belgrade 时间统一、今日特价模块、菜单促销态和对应测试改动，没有顺手扩 scope 的内容。

- [ ] **Step 5: 提交最终集成结果**

```bash
git add src/store/cartStore.ts src/components/MenuList.tsx src/pages/[slug]/index.astro src/components/CartModal.tsx src/lib/cart-store-promotions.test.ts src/pages/menu-list-promotions.test.ts src/pages/shop-promotions-surface.test.ts
git add ../foos2Go/internal/handlers/order_numbering.go ../foos2Go/internal/handlers/promotions.go ../foos2Go/internal/handlers/master_init_data.go ../foos2Go/internal/handlers/reservation.go ../foos2Go/internal/handlers/master_stats_test.go
git commit -m "feat: surface active specials with belgrade time alignment"
```
