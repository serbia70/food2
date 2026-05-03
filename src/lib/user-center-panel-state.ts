type MaybeOrder = Record<string, any>;
type MaybeUser = Record<string, any>;

export function buildUserCenterPanelState(input: {
	user: MaybeUser;
	currentShopName: string;
	currentShopSlug: string;
	orders: MaybeOrder[];
	addressSummary: string;
	membershipLabel: string;
}) {
	return {
		userName: String(input.user?.name || input.user?.phone || '用户'),
		loginAccount: String(input.user?.login_account || input.user?.phone || input.user?.email || ''),
		phone: String(input.user?.phone || ''),
		currentShopName: String(input.currentShopName || '当前店铺'),
		currentShopSlug: String(input.currentShopSlug || ''),
		orderCount: Array.isArray(input.orders) ? input.orders.length : 0,
		addressSummary: String(input.addressSummary || '暂无地址，去地址管理补充'),
		membershipLabel: String(input.membershipLabel || '暂无积分或 VIP 权益'),
	};
}
