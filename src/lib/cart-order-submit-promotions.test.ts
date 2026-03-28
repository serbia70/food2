import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeSpecialPromotions } from '../store/cartStore.ts';
import { useCartOrderSubmit } from '../components/cart-modal/useCartOrderSubmit.ts';

const cartModalPath = resolve(process.cwd(), 'src/components/CartModal.tsx');
const shopPagePath = resolve(process.cwd(), 'src/pages/[slug]/index.astro');

test('cart source wires spend discount progress into page and cart modal', async () => {
  const [cartModal, shopPage] = await Promise.all([
    readFile(cartModalPath, 'utf8'),
    readFile(shopPagePath, 'utf8'),
  ]);

  assert.match(cartModal, /spendDiscountPromotion\?: SpendDiscountPromotion \| null;/);
  assert.match(cartModal, /spendDiscountPromotion = null,/);
  assert.match(cartModal, /const spendDiscountStatus = getSpendDiscountStatus\(\$total\.price, spendDiscountPromotion\);/);
  assert.match(cartModal, /\{spendDiscountStatus && \(/);
  assert.match(cartModal, /再买 \$\{spendDiscountStatus\.remaining\} RSD，即可满 \$\{spendDiscountStatus\.minSpend\} 减 \$\{spendDiscountStatus\.discountAmount\}/);
  assert.match(cartModal, /已享满 \$\{spendDiscountStatus\.minSpend\} 减 \$\{spendDiscountStatus\.discountAmount\}/);
  assert.match(shopPage, /<CartModal[\s\S]*specialPromotionMap=\{specialPromotionMap\}[\s\S]*spendDiscountPromotion=\{spendDiscountPromotion\}/);
});

test('useCartOrderSubmit ignores removed promotion types in checkout totals', async () => {
  const promotionMap = normalizeSpecialPromotions([
    { promo_type: 'percent_discount', is_active: 1, discount_percent: 20 },
    { promo_type: 'bonus_points', is_active: 1, bonus_points: 30 },
  ]);

  let capturedBody = '';
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/order') {
      capturedBody = String(init?.body || '');
      return {
        ok: true,
        json: async () => ({ success: true, orderId: 456 }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${String(input)}`);
  };

  const windowMock = {
    location: {
      search: '',
      origin: 'http://localhost:3000',
      assign() {},
      href: 'http://localhost:3000/101',
    },
    parent: null,
    top: null,
    __suppressMqttReloadUntil: 0,
  } as unknown as Window & typeof globalThis;

  globalThis.fetch = fetchMock as typeof fetch;
  globalThis.window = windowMock;
  globalThis.setTimeout = (() => 0) as typeof setTimeout;
  globalThis.alert = () => {};
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;

  try {
    const { submitOrder } = useCartOrderSubmit({
      restaurantId: '101',
      isAdmin: false,
      form: { name: '', phone: '', password: '', address: '', note: '' },
      items: {
        1: { id: 1, name: 'Plain rice', price: 1200, quantity: 1 },
      },
      promotionMap,
      finalTotalDelivery: 1200,
      finalTotalDine: 1200,
      deliveryTimeMode: 'asap',
      reservationTime: '',
      deliveryRemarks: [],
      customRemark: '',
      dineInCustomRemark: '',
      resetAllRemarks: () => {},
      setLoading: () => {},
      setDeliveryTimeMode: () => {},
      setReservationTime: () => {},
    });

    await submitOrder('dine_in', 'cash', '1号桌');

    const payload = JSON.parse(capturedBody);
    assert.equal(payload.total, 1200);
    assert.equal(payload.items[0].price, 1200);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('useCartOrderSubmit sends discounted item price from passed promotionMap', async () => {
  const promotionMap = normalizeSpecialPromotions([
    {
      promo_type: 'special',
      is_active: 1,
      selected_products: [1],
      special_price_rsd: 999,
    },
  ]);

  let capturedBody = '';
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/order') {
      capturedBody = String(init?.body || '');
      return {
        ok: true,
        json: async () => ({ success: true, orderId: 123 }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${String(input)}`);
  };

  const windowMock = {
    location: {
      search: '',
      origin: 'http://localhost:3000',
      assign() {},
      href: 'http://localhost:3000/101',
    },
    parent: null,
    top: null,
    __suppressMqttReloadUntil: 0,
  } as unknown as Window & typeof globalThis;

  globalThis.fetch = fetchMock as typeof fetch;
  globalThis.window = windowMock;
  globalThis.setTimeout = (() => 0) as typeof setTimeout;
  globalThis.alert = () => {};
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;

  try {
    const { submitOrder } = useCartOrderSubmit({
      restaurantId: '101',
      isAdmin: false,
      form: { name: '', phone: '', password: '', address: '', note: '' },
      items: {
        1: { id: 1, name: 'Mapo tofu', price: 1583, quantity: 1 },
      },
      promotionMap,
      finalTotalDelivery: 999,
      finalTotalDine: 999,
      deliveryTimeMode: 'asap',
      reservationTime: '',
      deliveryRemarks: [],
      customRemark: '',
      dineInCustomRemark: '',
      resetAllRemarks: () => {},
      setLoading: () => {},
      setDeliveryTimeMode: () => {},
      setReservationTime: () => {},
    });

    await submitOrder('dine_in', 'cash', '1号桌');

    const payload = JSON.parse(capturedBody);
    assert.equal(payload.total, 999);
    assert.equal(payload.items[0].price, 999);
    assert.equal(payload.items[0].quantity, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.setTimeout = originalSetTimeout;
  }
});
