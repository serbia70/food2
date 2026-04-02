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
    const t = String(order?.orderType || '').trim();
    return t === 'delivery';
  });
}

export function buildRecentUserOrderSummary(orders: RawOrder[]): RecentUserOrderSummary {
  const visibleOrders = filterUserVisibleOrders(orders || []).sort((a, b) =>
    String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')),
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
  if (order?.isVip === true || order?.isVip === 1 || order?.isVip === '1') return true;
  const vipLevel = String(order?.vipLevel || '').trim();
  return Boolean(vipLevel && vipLevel !== '0' && vipLevel.toLowerCase() !== 'none');
}

function buildMembershipLabel(points: number | null, isVip: boolean) {
  const tags: string[] = [];
  if (isVip) tags.push('VIP');
  if (points !== null) tags.push(`积分 ${points}`);
  return tags.join(' · ');
}

export function buildUserOrderView(order: RawOrder, shopMap: UserOrderShopMap = {}): UserOrderView {
  const shopId = String(order?.shopId || order?.restaurantId || '').trim();
  const fallbackShop = shopId ? shopMap[shopId] || {} : {};
  const shopName = pickFirstString(order, ['shopName', 'restaurantName', 'merchantName']) || String(fallbackShop.name || '').trim() || '未知店铺';
  const shopSlug = pickFirstString(order, ['shopSlug', 'slug', 'restaurantSlug']) || String(fallbackShop.slug || '').trim();
  const points = pickFirstNumber(order, ['points', 'userPoints', 'pointsBalance']);
  const isVip = pickVip(order);

  return {
    raw: order,
    shopName,
    shopSlug,
    points,
    isVip,
    membershipLabel: buildMembershipLabel(points, isVip),
    createdAt: String(order?.createdAt || ''),
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
