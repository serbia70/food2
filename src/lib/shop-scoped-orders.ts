type MaybeOrder = Record<string, any>;
type ShopContext = { id?: string; slug?: string };

function pickPoints(order: MaybeOrder) {
  const candidates = [order?.points, order?.user_points, order?.points_balance];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function pickVip(order: MaybeOrder) {
  if (order?.is_vip === true || order?.is_vip === 1 || order?.is_vip === '1') return true;
  const vipLevel = String(order?.vip_level || '').trim();
  return Boolean(vipLevel && vipLevel !== '0' && vipLevel.toLowerCase() !== 'none');
}

function buildLabel(points: number | null, isVip: boolean) {
  const tags: string[] = [];
  if (isVip) tags.push('VIP');
  if (points !== null) tags.push(`积分 ${points}`);
  return tags.join(' · ');
}

export function filterOrdersForCurrentShop<T extends MaybeOrder>(orders: T[], shopContext: ShopContext): T[] {
  const currentShopId = String(shopContext?.id || '').trim();
  const currentSlug = String(shopContext?.slug || '').trim();

  return (orders || []).filter((order) => {
    if (String(order?.order_type || '').trim() !== 'delivery') return false;

    const orderShopId = String(order?.shop_id || order?.restaurant_id || '').trim();
    const orderSlug = String(order?.shop_slug || order?.slug || order?.restaurant_slug || '').trim();

    if (currentShopId && orderShopId && currentShopId === orderShopId) return true;
    if (currentSlug && orderSlug && currentSlug === orderSlug) return true;
    return false;
  });
}

export function buildCurrentShopMembershipSummary(orders: MaybeOrder[]) {
  let maxPoints: number | null = null;
  let hasVip = false;

  for (const order of orders || []) {
    const points = pickPoints(order);
    const isVip = pickVip(order);
    if ((points ?? -1) > (maxPoints ?? -1)) maxPoints = points;
    hasVip = hasVip || isVip;
  }

	return {
		points: maxPoints,
		isVip: hasVip,
		label: buildLabel(maxPoints, hasVip),
	};
}

export function splitOrdersByCurrentShop<T extends MaybeOrder>(orders: T[], shopContext: ShopContext) {
	const visibleOrders = (orders || []).filter((order) => String(order?.order_type || '').trim() === 'delivery');
	const currentShopOrders = filterOrdersForCurrentShop(visibleOrders, shopContext);
	const currentShopKeys = new Set(currentShopOrders.map((order) => String(order?.order_no || order?.id || '')));
	const otherOrders = visibleOrders.filter((order) => !currentShopKeys.has(String(order?.order_no || order?.id || '')));

	return {
		currentShopOrders,
		otherOrders,
	};
}

export function buildCurrentShopEmptyStateMessage(shopName: string) {
	const resolvedName = String(shopName || '').trim() || '当前店铺';
	return `当前店铺 ${resolvedName} 暂无外卖订单，可继续在本店下单`;
}
