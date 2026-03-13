export function buildCustomerChatWorkspaceContext(input: {
	shopId?: string | number;
	shopSlug?: string;
	shopName?: string;
	entry?: 'home' | 'profile';
}) {
	return {
		shopId: Number(input.shopId || 0),
		shopSlug: String(input.shopSlug || ''),
		shopName: String(input.shopName || '当前商家'),
		entry: input.entry || 'profile',
		title: `${String(input.shopName || '当前商家')} 聊天工作区`,
	};
}
