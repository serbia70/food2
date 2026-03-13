type RawOrder = Record<string, any>;

export interface UserOrderShopRef {
  id?: number | string;
  name?: string;
  slug?: string;
}

export type UserOrderShopMap = Record<string, UserOrderShopRef>;

export interface UserOrderView {
  raw: RawOrder;
  shopName: string;
  shopSlug: string;
  points: number | null;
  isVip: boolean;
  membershipLabel: string;
  createdAt: string;
}

export interface ShopMembershipSummary {
  shopKey: string;
  shopName: string;
  shopSlug: string;
  points: number | null;
  isVip: boolean;
  membershipLabel: string;
  orderCount: number;
  latestOrderAt: string;
}

export interface RecentUserOrderSummary {
  totalCount: number;
  latestOrder: RawOrder | null;
}

export function filterUserVisibleOrders<T extends RawOrder>(orders: T[]): T[] {
  return (orders || []).filter((order) => {
    const t = String(order?.order_type || '').trim();
    return t === 'delivery' || t === 'dine_in';
  });
}

export function buildRecentUserOrderSummary(orders: RawOrder[]): RecentUserOrderSummary {
  const visibleOrders = filterUserVisibleOrders(orders || []).sort((a, b) =>
    String(b?.created_at || '').localeCompare(String(a?.created_at || '')),
  );

  return {
    totalCount: visibleOrders.length,
    latestOrder: visibleOrders[0] || null,
  };
}

function pickFirstString(order: RawOrder, keys: string[]) {
  for (const key of keys) {
    const value = String(order?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function pickFirstNumber(order: RawOrder, keys: string[]) {
  for (const key of keys) {
    const raw = order?.[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function pickVip(order: RawOrder) {
  if (order?.is_vip === true || order?.is_vip === 1 || order?.is_vip === '1') return true;
  const vipLevel = String(order?.vip_level || '').trim();
  return Boolean(vipLevel && vipLevel !== '0' && vipLevel.toLowerCase() !== 'none');
}

function buildMembershipLabel(points: number | null, isVip: boolean) {
  const tags: string[] = [];
  if (isVip) tags.push('VIP');
  if (points !== null) tags.push(`积分 ${points}`);
  return tags.join(' · ');
}

export function buildUserOrderView(order: RawOrder, shopMap: UserOrderShopMap = {}): UserOrderView {
  const shopId = String(order?.shop_id || order?.restaurant_id || '').trim();
  const fallbackShop = shopId ? shopMap[shopId] || {} : {};
  const shopName = pickFirstString(order, ['shop_name', 'restaurant_name', 'merchant_name']) || String(fallbackShop.name || '').trim() || '未知店铺';
  const shopSlug = pickFirstString(order, ['shop_slug', 'slug', 'restaurant_slug']) || String(fallbackShop.slug || '').trim();
  const points = pickFirstNumber(order, ['points', 'user_points', 'points_balance']);
  const isVip = pickVip(order);

  return {
    raw: order,
    shopName,
    shopSlug,
    points,
    isVip,
    membershipLabel: buildMembershipLabel(points, isVip),
    createdAt: String(order?.created_at || ''),
  };
}

export function buildShopMembershipSummaries(orders: RawOrder[], shopMap: UserOrderShopMap = {}): ShopMembershipSummary[] {
  const grouped = new Map<string, ShopMembershipSummary>();

  for (const order of filterUserVisibleOrders(orders || [])) {
    const view = buildUserOrderView(order, shopMap);
    const shopKey = view.shopSlug || view.shopName;
    const existing = grouped.get(shopKey);

    if (!existing) {
      grouped.set(shopKey, {
        shopKey,
        shopName: view.shopName,
        shopSlug: view.shopSlug,
        points: view.points,
        isVip: view.isVip,
        membershipLabel: view.membershipLabel,
        orderCount: 1,
        latestOrderAt: view.createdAt,
      });
      continue;
    }

    existing.orderCount += 1;
    if ((view.points ?? -1) > (existing.points ?? -1)) existing.points = view.points;
    existing.isVip = existing.isVip || view.isVip;
    existing.membershipLabel = buildMembershipLabel(existing.points, existing.isVip);
    if (String(view.createdAt || '') > String(existing.latestOrderAt || '')) {
      existing.latestOrderAt = view.createdAt;
    }
  }

  return [...grouped.values()].sort((a, b) => String(b.latestOrderAt).localeCompare(String(a.latestOrderAt)));
}
