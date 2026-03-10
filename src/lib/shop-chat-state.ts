export function buildShopChatContext(input: {
	shopId?: string | number;
	shopName?: string;
	shopSlug?: string;
	userPhone?: string;
}) {
	return {
		shopId: Number(input.shopId || 0),
		shopName: String(input.shopName || '当前店铺'),
		shopSlug: String(input.shopSlug || ''),
		userPhone: String(input.userPhone || ''),
		title: `${String(input.shopName || '当前店铺')} 商家会话`,
	};
}
