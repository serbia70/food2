import { map, computed } from 'nanostores';
import type { Product } from '../types';

export type { Product };

export interface CartItem extends Product {
  quantity: number;
}

export interface SpecialPromotion {
  productId: string;
  specialPrice: number;
  startsAt?: number; // promotion starts_at timestamp (Belgrade local time)
}

export interface SpendDiscountPromotion {
  minSpend: number;
  discountAmount: number;
}

export function getSpendDiscountBannerCopy(spendDiscountPromotion: SpendDiscountPromotion | null) {
  if (!spendDiscountPromotion) return null;
  return `满 ${spendDiscountPromotion.minSpend} 减 ${spendDiscountPromotion.discountAmount} RSD`;
}

interface PromotionRecord {
  promo_type?: string;
  selected_products?: unknown;
  special_price_rsd?: unknown;
  min_spend_rsd?: unknown;
  discount_amount_rsd?: unknown;
  is_active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
}

export type CartStore = Record<string | number, CartItem>;

function toProductKey(productId: string | number) {
  return String(productId || '').trim();
}

const BELGRADE_OFFSET_STANDARD_MINUTES = 60;
const BELGRADE_OFFSET_DST_MINUTES = 120;

function getBelgradeOffsetMinutes(date: Date) {
  const year = date.getUTCFullYear();
  const marchLastSunday = new Date(Date.UTC(year, 2, 31));
  marchLastSunday.setUTCDate(31 - marchLastSunday.getUTCDay());
  const octoberLastSunday = new Date(Date.UTC(year, 9, 31));
  octoberLastSunday.setUTCDate(31 - octoberLastSunday.getUTCDay());
  const dstStartUtc = Date.UTC(year, 2, marchLastSunday.getUTCDate(), 1, 0, 0);
  const dstEndUtc = Date.UTC(year, 9, octoberLastSunday.getUTCDate(), 1, 0, 0);
  const time = date.getTime();
  return time >= dstStartUtc && time < dstEndUtc
    ? BELGRADE_OFFSET_DST_MINUTES
    : BELGRADE_OFFSET_STANDARD_MINUTES;
}

function parseBelgradeLocalDate(raw: string) {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return 0;
  const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const utcCandidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getBelgradeOffsetMinutes(utcCandidate);
  return utcCandidate.getTime() - offsetMinutes * 60 * 1000;
}

function parsePromotionDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const absolute = new Date(raw);
    return Number.isNaN(absolute.getTime()) ? 0 : absolute.getTime();
  }
  const belgradeLocal = parseBelgradeLocalDate(raw);
  if (belgradeLocal) return belgradeLocal;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
}

function compareByStartsAt(startsAt1?: number, startsAt2?: number): number {
  // 如果两者都没有 starts_at，保持原有顺序（相等）
  if (startsAt1 === undefined && startsAt2 === undefined) {
    return 0;
  }
  // 如果 startsAt1 有，startsAt2 没有，startsAt1 优先（返回 1）
  if (startsAt1 !== undefined && startsAt2 === undefined) {
    return 1;
  }
  // 如果 startsAt1 没有，startsAt2 有，startsAt2 优先（返回 -1）
  if (startsAt1 === undefined && startsAt2 !== undefined) {
    return -1;
  }
  // 如果两者都有，starts_at 更晚（更接近 now）的优先
  return startsAt1 - startsAt2; // startsAt1 > startsAt2 返回正数，表示 startsAt1 优先
}

function isPromotionActiveWindow(promotion: PromotionRecord, now = Date.now()) {
  if (!promotion) return false;
  const activeRaw = promotion.is_active;
  const isActive = activeRaw === true || activeRaw === 1 || activeRaw === '1';
  if (!isActive) return false;
  const startsAt = parsePromotionDate(promotion.starts_at);
  const endsAt = parsePromotionDate(promotion.ends_at);
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
}

function isPromotionActive(promotion: PromotionRecord, promoType: string, now = Date.now()) {
  if (!promotion || promotion.promo_type !== promoType) return false;
  return isPromotionActiveWindow(promotion, now);
}

function parseSelectedProductIds(raw: unknown) {
  const normalizeValues = (values: unknown[]) =>
    values
      .map((value) => {
        if (typeof value === 'object' && value !== null) {
          const record = value as { id?: string | number; product_id?: string | number; value?: string | number };
          return toProductKey(record.id ?? record.product_id ?? record.value ?? '');
        }
        return toProductKey(value as string | number);
      })
      .filter(Boolean);

  if (Array.isArray(raw)) {
    return normalizeValues(raw);
  }
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? normalizeValues(parsed) : [];
  } catch {
    return text.includes(',')
      ? normalizeValues(text.split(','))
      : normalizeValues([text]);
  }
}

export function normalizeSpecialPromotions(promotions: unknown): Record<string, SpecialPromotion> {
  if (!Array.isArray(promotions)) return {};
  const now = Date.now();

  return promotions.reduce<Record<string, SpecialPromotion>>((acc, promotion) => {
    const record = promotion as PromotionRecord;
    if (!isPromotionActive(record, 'special', now)) return acc;
    const specialPrice = Number(record.special_price_rsd || 0);
    if (!Number.isFinite(specialPrice) || specialPrice <= 0) return acc;
    const productIds = parseSelectedProductIds(record.selected_products);
    const startsAt = parsePromotionDate(record.starts_at);

    productIds.forEach((productId) => {
      const existing = acc[productId];

      // 去重优先级：显式 tie-break
      // 1. 更低的 specialPrice 优先
      // 2. 若 specialPrice 相同：
      //    - starts_at 更晚（更接近 now）的优先
      //    - 没有 starts_at 的优先级低于有 starts_at
      //    - 若仍无法区分，保留更早遍历到的项
      if (!existing) {
        acc[productId] = { productId, specialPrice, startsAt };
      } else if (specialPrice < existing.specialPrice) {
        acc[productId] = { productId, specialPrice, startsAt };
      } else if (specialPrice > existing.specialPrice) {
        // 更高的价格，跳过（已存在更优价格）
      } else {
        // specialPrice 相同，应用 starts_at tie-break 规则
        if (compareByStartsAt(startsAt, existing.startsAt) > 0) {
          acc[productId] = { productId, specialPrice, startsAt };
        }
      }
    });
    return acc;
  }, {});
}

export function normalizeSpendDiscountPromotions(promotions: unknown): SpendDiscountPromotion | null {
  if (!Array.isArray(promotions)) return null;
  const now = Date.now();

  return promotions.reduce<SpendDiscountPromotion | null>((best, promotion) => {
    const record = promotion as PromotionRecord;
    if (!isPromotionActive(record, 'spend_discount', now)) return best;

    const minSpend = Number(record.min_spend_rsd || 0);
    const discountAmount = Number(record.discount_amount_rsd || 0);
    if (!Number.isFinite(minSpend) || minSpend <= 0) return best;
    if (!Number.isFinite(discountAmount) || discountAmount <= 0) return best;

    const candidate: SpendDiscountPromotion = { minSpend, discountAmount };
    if (!best) return candidate;
    return candidate.minSpend > best.minSpend ? candidate : best;
  }, null);
}

export function getSpendDiscountStatus(total: number, promotion: SpendDiscountPromotion | null) {
  if (!promotion) return null;
  const qualified = total >= promotion.minSpend;
  const remaining = qualified ? 0 : Math.max(promotion.minSpend - total, 0);
  return {
    minSpend: promotion.minSpend,
    discountAmount: promotion.discountAmount,
    qualified,
    remaining,
  };
}

export function resolveCartItemUnitPrice(item: Pick<CartItem, 'id' | 'price'>, promotions: Record<string, SpecialPromotion>) {
  const productKey = toProductKey(item.id);
  return promotions[productKey]?.specialPrice ?? Number(item.price || 0);
}

export interface SpecialPriceDisplay {
  displayPrice: number;
  originalPrice: number;
  isSpecialPrice: boolean;
}

export function getSpecialPriceDisplay(
  item: Pick<CartItem, 'id' | 'price'>,
  promotions: Record<string, SpecialPromotion>,
): SpecialPriceDisplay {
  const originalPrice = Number(item.price || 0);
  const displayPrice = resolveCartItemUnitPrice(item, promotions);
  return {
    displayPrice,
    originalPrice,
    isSpecialPrice: displayPrice < originalPrice,
  };
}

export interface ActiveSpecialProduct {
  productId: string;
  productName: string;
  productSubName: string;
  originalPrice: number;
  specialPrice: number;
}

export function getCartTotals(
  items: CartStore,
  promotions: Record<string, SpecialPromotion>,
) {
  let total = 0;
  let count = 0;
  Object.values(items).forEach((item) => {
    total += resolveCartItemUnitPrice(item, promotions) * item.quantity;
    count += item.quantity;
  });
  return { price: total, count };
}

export function getActiveSpecialPromotionProducts(
  products: Product[],
  promotions: Record<string, SpecialPromotion>,
): ActiveSpecialProduct[] {

  const productIndexMap = new Map<string, number>();
  const productMap = new Map<string, Product>();
  products.forEach((product, index) => {
    const productId = toProductKey(product.id);
    productIndexMap.set(productId, index);
    productMap.set(productId, product);
  });

  const items: Array<{ productId: string; specialPrice: number; originalIndex: number }> = [];

  Object.entries(promotions).forEach(([productId, promotion]) => {
    if (!productMap.has(productId)) return;
    items.push({
      productId,
      specialPrice: promotion.specialPrice,
      originalIndex: productIndexMap.get(productId) ?? Infinity,
    });
  });

  items.sort((a, b) => {
    if (a.specialPrice !== b.specialPrice) {
      return a.specialPrice - b.specialPrice;
    }
    return a.originalIndex - b.originalIndex;
  });

  return items.map((item) => {
    const product = productMap.get(item.productId)!;
    return {
      productId: toProductKey(product.id),
      productName: product.name || '',
      productSubName: product.subName || product.sub_name || '',
      originalPrice: product.price || 0,
      specialPrice: item.specialPrice,
    };
  });
}

// Store: { [productId]: { ...product, quantity: 1 } }
export const cartItems = map<CartStore>({});

export function addToCart(product: Product) {
  const current = cartItems.get();
  const existing = current[product.id];
  if (existing) {
    cartItems.setKey(product.id, { ...existing, quantity: existing.quantity + 1 });
  } else {
    cartItems.setKey(product.id, { ...product, quantity: 1 });
  }
}

export function removeOne(productId: string | number) {
  const current = cartItems.get();
  const existing = current[productId];
  if (!existing) return;

  if (existing.quantity > 1) {
    cartItems.setKey(productId, { ...existing, quantity: existing.quantity - 1 });
  } else {
    const newCart = { ...current };
    delete newCart[productId];
    cartItems.set(newCart);
  }
}

export function removeFromCart(productId: string | number) {
  const current = cartItems.get();
  if (!(productId in current)) return;
  const next = { ...current };
  delete next[productId];
  cartItems.set(next);
}

// clear cart
export function clearCart() {
  cartItems.set({});
}


