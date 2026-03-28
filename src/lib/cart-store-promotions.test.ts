import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToCart,
  cartItems,
  clearCart,
  getActiveSpecialPromotionProducts,
  getCartTotals,
  getSpendDiscountStatus,
  normalizeSpecialPromotions,
  normalizeSpendDiscountPromotions,
  resolveCartItemUnitPrice,
} from '../store/cartStore.ts';

test('getCartTotals applies active special promotion price to selected products', () => {
  clearCart();
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [101],
      special_price_rsd: 999,
    },
  ]);

  addToCart({ id: 101, name: '特价菜', price: 1535 });

  assert.deepEqual(getCartTotals(cartItems.get(), promotions), { price: 999, count: 1 });

  clearCart();
});

test('getCartTotals keeps original price when promotion is inactive or expired', () => {
  clearCart();
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 0,
      selected_products: [102],
      special_price_rsd: 888,
    },
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [102],
      special_price_rsd: 777,
      ends_at: '2000-01-01 00:00:00',
    },
  ]);

  addToCart({ id: 102, name: '原价菜', price: 1535 });

  assert.deepEqual(getCartTotals(cartItems.get(), promotions), { price: 1535, count: 1 });
  assert.equal(resolveCartItemUnitPrice(cartItems.get()[102], promotions), 1535);

  clearCart();
});

test('getCartTotals treats naive promotion datetime as Europe/Belgrade local time', () => {
  clearCart();

  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const promotions = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [103],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
        ends_at: '2026-03-27 19:00:00',
      },
    ]);

    addToCart({ id: 103, name: '贝尔格莱德特价菜', price: 1535 });

    assert.deepEqual(getCartTotals(cartItems.get(), promotions), { price: 999, count: 1 });
  } finally {
    Date.now = realNow;
    clearCart();
  }
});

test('getActiveSpecialPromotionProducts deduplicates products across promotions', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const promotions = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [201, 202],
        special_price_rsd: 999,
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [201, 999],
        special_price_rsd: 1099,
      },
    ]);

    const activePromos = getActiveSpecialPromotionProducts(
      [
        { id: 201, name: '商品201', sub_name: '子商品201', price: 999 },
        { id: 202, name: '商品202', sub_name: '子商品202', price: 999 },
      ],
      promotions,
    );

    assert.equal(activePromos.length, 2);
    assert.equal(activePromos.find((p) => p.productId === '201')?.specialPrice, 999);
    assert.equal(activePromos.find((p) => p.productId === '202')?.specialPrice, 999);
  } finally {
    Date.now = realNow;
  }
});

test('normalizeSpecialPromotions implements tie-break by starts_at (later is better)', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const result = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:20:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
      },
    ]);

    assert.equal(result['301']?.specialPrice, 999);
    assert.equal(result['301']?.startsAt, new Date('2026-03-27T18:20:00+01:00').getTime());
    assert.equal(Object.keys(result).length, 1);
  } finally {
    Date.now = realNow;
  }
});

test('normalizeSpecialPromotions implements tie-break when same special price and same starts_at', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const result = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
      },
    ]);

    assert.equal(result['301']?.specialPrice, 999);
    assert.equal(Object.keys(result).length, 1);
  } finally {
    Date.now = realNow;
  }
});

test('normalizeSpecialPromotions prefers promotion with starts_at over same-price promotion without starts_at', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const result = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
        starts_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [301],
        special_price_rsd: 999,
      },
    ]);

    assert.equal(result['301']?.specialPrice, 999);
    assert.ok(result['301']?.startsAt);
    assert.equal(Object.keys(result).length, 1);
  } finally {
    Date.now = realNow;
  }
});

test('getActiveSpecialPromotionProducts keeps subName compatibility', () => {
  const promotions = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [11, 12],
      special_price_rsd: 500,
    },
  ]);

  const activePromos = getActiveSpecialPromotionProducts(
    [
      { id: 11, name: '商品11', subName: '新副名11', price: 100 },
      { id: 12, name: '商品12', sub_name: '旧副名12', price: 100 },
    ],
    promotions,
  );

  assert.deepEqual(
    activePromos.map((item) => item.productSubName),
    ['新副名11', '旧副名12'],
  );
});

test('getActiveSpecialPromotionProducts sorts by special price then original menu order', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const products = [
      { id: 1, name: '商品1', sub_name: '子商品1', price: 100 },
      { id: 2, name: '商品2', sub_name: '子商品2', price: 100 },
      { id: 3, name: '商品3', sub_name: '子商品3', price: 100 },
      { id: 4, name: '商品4', sub_name: '子商品4', price: 100 },
    ];

    const promotions = normalizeSpecialPromotions([
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [3, 1],
        special_price_rsd: 800,
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [2, 4],
        special_price_rsd: 800,
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [1, 3],
        special_price_rsd: 500,
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [4, 2],
        special_price_rsd: 500,
      },
    ]);

    const activePromos = getActiveSpecialPromotionProducts(products, promotions);

    assert.equal(activePromos.length, 4);
    assert.deepEqual(
      activePromos.map((item) => [item.productId, item.specialPrice]),
      [
        ['1', 500],
        ['2', 500],
        ['3', 500],
        ['4', 500],
      ],
    );
  } finally {
    Date.now = realNow;
  }
});

test('normalizeSpendDiscountPromotions selects active highest min_spend', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const promotion = normalizeSpendDiscountPromotions([
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 1000,
        discount_amount_rsd: 100,
      },
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 1500,
        discount_amount_rsd: 120,
        starts_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 3000,
        discount_amount_rsd: 300,
        starts_at: '2026-03-27 19:00:00',
      },
      {
        promo_type: 'special',
        is_active: 1,
        selected_products: [1],
        special_price_rsd: 500,
      },
    ]);

    assert.deepEqual(promotion, {
      minSpend: 1500,
      discountAmount: 120,
    });
  } finally {
    Date.now = realNow;
  }
});

test('normalizeSpendDiscountPromotions returns null when no active spend_discount exists', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const promotion = normalizeSpendDiscountPromotions([
      {
        promo_type: 'spend_discount',
        is_active: 0,
        min_spend_rsd: 1000,
        discount_amount_rsd: 100,
      },
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 1200,
        discount_amount_rsd: 120,
        starts_at: '2026-03-27 19:00:00',
      },
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 900,
        discount_amount_rsd: 90,
        ends_at: '2026-03-27 18:00:00',
      },
      {
        promo_type: 'percent_discount',
        is_active: 1,
      },
      {
        promo_type: 'bonus_points',
        is_active: 1,
      },
    ]);

    assert.equal(promotion, null);
  } finally {
    Date.now = realNow;
  }
});

test('getSpendDiscountStatus returns cart progress fields', () => {
  const promotion = { minSpend: 1500, discountAmount: 200 };

  assert.deepEqual(getSpendDiscountStatus(1000, promotion), {
    minSpend: 1500,
    discountAmount: 200,
    qualified: false,
    remaining: 500,
  });

  assert.deepEqual(getSpendDiscountStatus(1800, promotion), {
    minSpend: 1500,
    discountAmount: 200,
    qualified: true,
    remaining: 0,
  });

  assert.equal(getSpendDiscountStatus(1000, null), null);
});

test('removed promotion types do not affect totals or spend-discount status', () => {
  clearCart();

  try {
    const specialPromotions = normalizeSpecialPromotions([
      {
        promo_type: 'percent_discount',
        is_active: 1,
        selected_products: [500],
        special_price_rsd: 1,
      },
      {
        promo_type: 'bonus_points',
        is_active: 1,
        selected_products: [500],
        special_price_rsd: 1,
      },
    ]);

    addToCart({ id: 500, name: '普通商品', price: 1500 });
    assert.deepEqual(getCartTotals(cartItems.get(), specialPromotions), { price: 1500, count: 1 });

    const spendPromotion = normalizeSpendDiscountPromotions([
      { promo_type: 'percent_discount', is_active: 1, min_spend_rsd: 1000, discount_amount_rsd: 100 },
      { promo_type: 'bonus_points', is_active: 1, min_spend_rsd: 1000, discount_amount_rsd: 100 },
    ]);
    assert.equal(spendPromotion, null);
    assert.equal(getSpendDiscountStatus(1500, spendPromotion), null);
  } finally {
    clearCart();
  }
});

test('normalizeSpendDiscountPromotions treats naive datetime as Europe/Belgrade local time', () => {
  const realNow = Date.now;
  Date.now = () => new Date('2026-03-27T18:30:00+01:00').getTime();

  try {
    const promotion = normalizeSpendDiscountPromotions([
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 1400,
        discount_amount_rsd: 200,
        starts_at: '2026-03-27 18:00:00',
        ends_at: '2026-03-27 19:00:00',
      },
      {
        promo_type: 'spend_discount',
        is_active: 1,
        min_spend_rsd: 1600,
        discount_amount_rsd: 250,
        starts_at: '2026-03-27 19:00:00',
        ends_at: '2026-03-27 20:00:00',
      },
    ]);

    assert.deepEqual(promotion, {
      minSpend: 1400,
      discountAmount: 200,
    });
  } finally {
    Date.now = realNow;
  }
});
