import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getActiveSpecialPromotionProducts,
  getCartTotals,
  getSpecialPriceDisplay,
  getSpendDiscountBannerCopy,
  normalizeSpecialPromotions,
  removeFromCart,
  addToCart,
  cartItems,
  clearCart,
} from '../store/cartStore.ts';

const shopPagePath = new URL('../../pages/[slug]/index.astro', import.meta.url);
const menuListPath = new URL('../components/MenuList.tsx', import.meta.url);
const cartModalPath = new URL('../components/CartModal.tsx', import.meta.url);
const reservationModalPath = new URL('../components/ReservationModal.tsx', import.meta.url);

function withCart<T>(fn: () => T): T {
  clearCart();
  try {
    return fn();
  } finally {
    clearCart();
  }
}

test('getSpecialPriceDisplay returns special price state for promoted product and original state for regular product', () => {
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [101],
      special_price_rsd: 999,
    },
  ]);

  assert.deepEqual(getSpecialPriceDisplay({ id: 101, price: 1535 }, promotions), {
    displayPrice: 999,
    originalPrice: 1535,
    isSpecialPrice: true,
  });

  assert.deepEqual(getSpecialPriceDisplay({ id: 102, price: 888 }, promotions), {
    displayPrice: 888,
    originalPrice: 888,
    isSpecialPrice: false,
  });
});

test('getSpecialPriceDisplay stays consistent for string and numeric product ids', () => {
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [201],
      special_price_rsd: 777,
    },
  ]);

  const numericDisplay = getSpecialPriceDisplay({ id: 201, price: 1200 }, promotions);
  const stringDisplay = getSpecialPriceDisplay({ id: '201', price: 1200 }, promotions);

  assert.deepEqual(numericDisplay, {
    displayPrice: 777,
    originalPrice: 1200,
    isSpecialPrice: true,
  });
  assert.deepEqual(stringDisplay, numericDisplay);
});

test('menu price display, cart line price, and cart total use the same promotion map', () => {
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [501],
      special_price_rsd: 900,
    },
  ]);

  const menuDisplay = getSpecialPriceDisplay({ id: 501, price: 1500 }, promotions);
  const cartLineDisplay = getSpecialPriceDisplay({ id: 501, price: 1500 }, promotions);
  const totals = getCartTotals(
    {
      501: { id: 501, name: '促销菜', price: 1500, quantity: 2 },
    },
    promotions,
  );

  assert.equal(menuDisplay.displayPrice, 900);
  assert.deepEqual(cartLineDisplay, menuDisplay);
  assert.deepEqual(totals, { price: 1800, count: 2 });
});

test('getActiveSpecialPromotionProducts returns only real promoted menu products in sorted order', () => {
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [3, 1, 999],
      special_price_rsd: 500,
    },
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [2],
      special_price_rsd: 800,
    },
  ]);

  assert.deepEqual(
    getActiveSpecialPromotionProducts(
      [
        { id: 1, name: '商品1', sub_name: '子商品1', price: 100 },
        { id: 2, name: '商品2', sub_name: '子商品2', price: 200 },
        { id: 3, name: '商品3', sub_name: '子商品3', price: 300 },
      ],
      promotions,
    ),
    [
      {
        productId: '1',
        productName: '商品1',
        productSubName: '子商品1',
        originalPrice: 100,
        specialPrice: 500,
      },
      {
        productId: '3',
        productName: '商品3',
        productSubName: '子商品3',
        originalPrice: 300,
        specialPrice: 500,
      },
      {
        productId: '2',
        productName: '商品2',
        productSubName: '子商品2',
        originalPrice: 200,
        specialPrice: 800,
      },
    ],
  );
});

test('removeFromCart removes the whole item in one update', () => {
  withCart(() => {
    addToCart({ id: 301, name: '整项删除菜', price: 50 });
    addToCart({ id: 301, name: '整项删除菜', price: 50 });
    addToCart({ id: 302, name: '保留菜', price: 60 });

    removeFromCart(301);

    assert.equal(cartItems.get()[301], undefined);
    assert.equal(cartItems.get()[302]?.quantity, 1);
  });
});

test('getSpendDiscountBannerCopy returns null without promo and formatted copy with promo', () => {
  assert.equal(getSpendDiscountBannerCopy(null), null);
  assert.equal(
    getSpendDiscountBannerCopy({ minSpend: 1500, discountAmount: 200 }),
    '满 1500 减 200 RSD',
  );
});

test('shop page passes normalized promotion helpers to shell and cart-related consumers', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /const specialPromotionMap = normalizeSpecialPromotions\(promotionsData\);/);
  assert.match(file, /const spendDiscountPromotion = normalizeSpendDiscountPromotions\(promotionsData\);/);
  assert.match(file, /<ShopMenuShell[\s\S]*specialPromotionMap=\{specialPromotionMap\}[\s\S]*spendDiscountPromotion=\{spendDiscountPromotion\}/);
  assert.match(file, /<CartModal[\s\S]*specialPromotionMap=\{specialPromotionMap\}/);
  assert.match(file, /<UserModal[\s\S]*specialPromotionMap=\{specialPromotionMap\}/);
  assert.match(file, /<ReservationModal[\s\S]*specialPromotionMap=\{specialPromotionMap\}/);
});

test('MenuList source renders spend discount block only when active promo exists', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /spendDiscountPromotion\?: SpendDiscountPromotion \| null;/);
  assert.match(file, /getSpendDiscountBannerCopy,/);
  assert.match(file, /const spendDiscountBannerCopy = getSpendDiscountBannerCopy\(spendDiscountPromotion\);/);
  assert.match(file, /const spendDiscountParts = spendDiscountBannerCopy\?\.match\(/);
  assert.match(file, /\^满\\s\*\(\\d\+\)\\s\*减\\s\*\(\\d\+\)\\s\*RSD\$\/\);/);
  assert.match(file, /\{spendDiscountBannerCopy && spendDiscountParts && \(/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#111827' \}\}>满减活动<\/span>/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>满<\/span>/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#dc2626' \}\}>\{spendDiscountParts\?\.\[1\]\}<\/span>/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>减<\/span>/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', fontWeight: '800', color: '#dc2626' \}\}>\{spendDiscountParts\?\.\[2\]\}<\/span>/);
  assert.match(file, /<span style=\{\{ fontSize: '15px', color: '#111827' \}\}>RSD<\/span>/);
});

test('MenuList source renders 今日特价 category section before normal categories and reuses full menu card logic', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /\{activeSpecialPromotionProducts\.length > 0 && \(/);
  assert.match(file, /activeSpecialPromotionProducts\.map\(\(product\) => \{/);
  assert.match(file, /<div className="section-header"[\s\S]*>\s*今日特价\s*<\/div>/);

  const specialSectionStart = file.indexOf('今日特价');
  const categoriesMapStart = file.indexOf('{categories.map((cat) => (');
  assert.ok(specialSectionStart !== -1 && categoriesMapStart !== -1 && specialSectionStart < categoriesMapStart);

  assert.match(file, /const hasImg = !!p\.img && p\.img !== '\/favicon\.svg' && !p\.img\.includes\('dummyimage'\);/);
  assert.match(file, /\{hasImg && !isTextMode && \(/);
  assert.match(file, /<img[\s\S]*src=\{p\.img\}[\s\S]*alt=\{p\.name\}/);
  assert.doesNotMatch(file, /const hasImg = false;/);
});

test('CartModal source passes specialPromotionMap through totals, submit, and line prices', async () => {
  const file = await readFile(cartModalPath, 'utf8');

  assert.match(file, /specialPromotionMap\?: Record<string, SpecialPromotion>;/);
  assert.match(file, /specialPromotionMap = \{\},/);
  assert.match(file, /const \$total = useMemo\(\(\) => getCartTotals\(\$items, specialPromotionMap\), \[\$items, specialPromotionMap\]\);/);
  assert.match(file, /promotionMap: specialPromotionMap,/);
  assert.match(file, /getSpecialPriceDisplay\(item, specialPromotionMap\)/);
  assert.match(file, /item\.subName \|\| item\.sub_name/);
});

test('ReservationModal source uses specialPromotionMap for menu pre-order prices', async () => {
  const file = await readFile(reservationModalPath, 'utf8');

  assert.match(file, /specialPromotionMap\?: Record<string, SpecialPromotion>;/);
  assert.match(file, /specialPromotionMap = \{\},/);
  assert.match(file, /item\.subName \|\| item\.sub_name \|\| ""/);
  assert.match(file, /resolveCartItemUnitPrice\([\s\S]*item\.product_id[\s\S]*specialPromotionMap[\s\S]*\)/);
  assert.match(file, /resolveCartItemUnitPrice\([\s\S]*p\.id[\s\S]*specialPromotionMap[\s\S]*\)/);
});

test('shop page source mounts ShopMenuShell for shared menu category state', async () => {
  const file = await readFile(shopPagePath, 'utf8');

  assert.match(file, /import ShopMenuShell from /);
  assert.match(file, /<ShopMenuShell[\s\S]*categories=\{activeMenu\}[\s\S]*specialPromotionMap=\{specialPromotionMap\}[\s\S]*spendDiscountPromotion=\{spendDiscountPromotion\}/);
  assert.doesNotMatch(file, /<Sidebar categories=\{activeMenu\}/);
  assert.doesNotMatch(file, /<MenuList[\s\S]*client:load=\{true\}/);
});

test('ShopMenuShell source owns shared active category state for sidebar and menu list', async () => {
  const shellPath = new URL('../components/shop/ShopMenuShell.tsx', import.meta.url);
  const file = await readFile(shellPath, 'utf8');

  assert.match(file, /const \[activeCategoryId, setActiveCategoryId\] = useState<[^>]+>\([^)]*\);/);
  assert.match(file, /<Sidebar[\s\S]*activeId=\{activeCategoryId\}/);
  assert.match(file, /<MenuList[\s\S]*onActiveCategoryChange=\{setActiveCategoryId\}/);
  assert.doesNotMatch(file, /activeCategoryId=\{activeCategoryId\}/);
});

test('Sidebar source uses controlled active category and offset-based scrolling', async () => {
  const sidebarPath = new URL('../components/Sidebar.tsx', import.meta.url);
  const file = await readFile(sidebarPath, 'utf8');

  assert.match(file, /activeId\?: string;/);
  assert.match(file, /stickyOffsetTop\?: number;/);
  assert.doesNotMatch(file, /useState\(/);
  assert.match(file, /Math\.max\(el\.offsetTop - stickyOffsetTop, 0\)/);
  assert.match(file, /container\.scrollTo\(\{ top, behavior: ['\"]smooth['\"] \}\);/);
});

test('MenuList source syncs active category from scroll without extra horizontal category bar', async () => {
  const file = await readFile(menuListPath, 'utf8');

  assert.match(file, /onActiveCategoryChange\?: \(categoryId: string \| undefined\) => void;/);
  assert.match(file, /const stickyOffsetTop = \d+;/);
  assert.match(file, /const categoryScrollOffset = stickyOffsetTop;/);
  assert.match(file, /const sectionAnchorTop = container\.scrollTop \+ categoryScrollOffset;/);
  assert.match(file, /onActiveCategoryChange\?\.\(nextActiveCategoryId\);/);
  assert.doesNotMatch(file, /activeCategoryId\?: string;/);
  assert.doesNotMatch(file, /position: 'sticky'/);
  assert.doesNotMatch(file, /handleCategoryTabClick/);
});

test('ShopMenuShell source passes one scroll offset to Sidebar and change callback to MenuList', async () => {
  const shellPath = new URL('../components/shop/ShopMenuShell.tsx', import.meta.url);
  const file = await readFile(shellPath, 'utf8');

  assert.match(file, /const categoryScrollOffset = \d+;/);
  assert.match(file, /<Sidebar[\s\S]*stickyOffsetTop=\{categoryScrollOffset\}/);
  assert.match(file, /<MenuList[\s\S]*onActiveCategoryChange=\{setActiveCategoryId\}/);
  assert.doesNotMatch(file, /activeCategoryId=\{activeCategoryId\}/);
  assert.doesNotMatch(file, /categoryScrollOffset=\{categoryScrollOffset\}/);
});
